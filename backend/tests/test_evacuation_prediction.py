"""Tests for the synthetic route-time ML experiment and inference service."""

import csv
import importlib.util
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

import joblib
import networkx as nx
import pytest
from sklearn.model_selection import GroupShuffleSplit

from app.database.emergency_repository import EmergencyConditionSnapshot
from app.schemas.prediction import RouteTimePredictionRequest
from app.services.evacuation_prediction import (
    MODEL_VERSION,
    PredictionArtifactError,
    predict_travel_time,
)
from app.services.prediction_features import (
    FEATURE_NAMES,
    FEATURE_UNITS,
    PredictionFeatureError,
    RouteScenarioSegment,
    extract_route_features,
)
from app.services.route_prediction_service import (
    RoutePredictionBlockedError,
    RoutePredictionInputError,
    predict_specified_route,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPOSITORY_ROOT / "ai" / "prediction" / "train_experiment.py"
SPEC = importlib.util.spec_from_file_location("campus_safe_train_experiment", SCRIPT_PATH)
experiment = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = experiment
SPEC.loader.exec_module(experiment)

NOW = datetime(2026, 10, 9, 12, tzinfo=timezone.utc)
CAMPUS = UUID("10000000-0000-4000-8000-000000000001")
NODE_A = UUID("20000000-0000-4000-8000-000000000001")
NODE_B = UUID("20000000-0000-4000-8000-000000000002")
NODE_C = UUID("20000000-0000-4000-8000-000000000003")
EDGE_AB = UUID("30000000-0000-4000-8000-000000000001")
EDGE_BC = UUID("30000000-0000-4000-8000-000000000002")


def train_test_artifact(path: Path):
    report = experiment.train_and_evaluate(
        path.parent,
        route_template_count=10,
        scenarios_per_template=2,
        random_seed=41,
        n_estimators=20,
    )
    return report, path.parent / "evacuation_time_rf.joblib"


def test_synthetic_generation_is_reproducible_and_uses_expected_features():
    first = experiment.generate_synthetic_dataset(
        route_template_count=8, scenarios_per_template=3, random_seed=9
    )
    second = experiment.generate_synthetic_dataset(
        route_template_count=8, scenarios_per_template=3, random_seed=9
    )

    assert first == second
    assert len(first) == 24
    assert all(tuple(row.features) == FEATURE_NAMES for row in first)
    assert all(math.isfinite(row.estimated_travel_time_s) for row in first)
    assert all(row.estimated_travel_time_s >= 0 for row in first)
    assert all(row.analytical_baseline_s == row.estimated_travel_time_s for row in first)
    assert FEATURE_UNITS["total_distance_m"] == "m"
    assert FEATURE_UNITS["base_walking_speed_mps"] == "m/s"


def test_experiment_saves_artifacts_and_reports_actual_heldout_metrics(tmp_path):
    report, model_path = train_test_artifact(tmp_path / "model.joblib")
    dataset_path = Path(report["artifacts"]["dataset"])
    evaluation_path = Path(report["artifacts"]["evaluation"])

    assert model_path.is_file()
    assert dataset_path.is_file()
    assert evaluation_path.is_file()
    assert report["train_template_count"] + report["test_template_count"] == 10
    assert report["train_row_count"] + report["test_row_count"] == 20

    with dataset_path.open(newline="", encoding="utf-8") as dataset_file:
        rows = list(csv.DictReader(dataset_file))
    labels = [float(row["estimated_travel_time_s"]) for row in rows]
    groups = [row["route_template_id"] for row in rows]
    x = [[float(row[name]) for name in FEATURE_NAMES] for row in rows]
    seed = report["random_seed"]
    train_indices, test_indices = next(
        GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=seed).split(
            x, labels, groups=groups
        )
    )
    assert {groups[i] for i in train_indices}.isdisjoint(
        {groups[i] for i in test_indices}
    )

    bundle = joblib.load(model_path)
    actual = [labels[index] for index in test_indices]
    forest = [float(value) for value in bundle["model"].predict([x[i] for i in test_indices])]
    baseline = [
        (float(rows[index]["total_distance_m"])
         + float(rows[index]["distance_weighted_congestion_m"]))
        / float(rows[index]["base_walking_speed_mps"])
        for index in test_indices
    ]
    recomputed_rf = experiment._regression_metrics(actual, forest)
    recomputed_baseline = experiment._regression_metrics(actual, baseline)
    assert report["random_forest"] == pytest.approx(recomputed_rf)
    assert report["baseline"]["definition"].startswith("Phase 4 analytical sum")
    assert report["baseline"]["mae_seconds"] == pytest.approx(recomputed_baseline["mae_seconds"])
    assert report["baseline"]["rmse_seconds"] == pytest.approx(recomputed_baseline["rmse_seconds"])
    assert report["baseline"]["r2"] == pytest.approx(recomputed_baseline["r2"])
    assert report["target"] == "estimated_travel_time_s"


def test_training_and_evaluation_are_deterministic(tmp_path):
    first = experiment.train_and_evaluate(
        tmp_path / "first", route_template_count=10, scenarios_per_template=2,
        random_seed=77, n_estimators=15,
    )
    second = experiment.train_and_evaluate(
        tmp_path / "second", route_template_count=10, scenarios_per_template=2,
        random_seed=77, n_estimators=15,
    )

    assert first["baseline"] == second["baseline"]
    assert first["random_forest"] == second["random_forest"]
    assert first["train_row_count"] == second["train_row_count"]
    assert first["test_row_count"] == second["test_row_count"]


def test_model_save_load_prediction_consistency_and_provenance(tmp_path):
    _, model_path = train_test_artifact(tmp_path / "model.joblib")
    example = experiment.generate_synthetic_dataset(
        route_template_count=6, scenarios_per_template=2, random_seed=3
    )[0]

    result = predict_travel_time(example.features, artifact_path=model_path)
    bundle = joblib.load(model_path)
    expected = float(
        bundle["model"].predict([[example.features[name] for name in FEATURE_NAMES]])[0]
    )

    assert result.predicted_travel_time_s == pytest.approx(expected)
    assert result.model_version == MODEL_VERSION
    assert result.training_data_type == "synthetic_phase4_formula_labels"
    assert "not validated" in result.validation_limitation


def test_prediction_rejects_bad_features_and_missing_artifact(tmp_path):
    with pytest.raises(PredictionFeatureError, match="feature names"):
        predict_travel_time({"distance": 2}, artifact_path=tmp_path / "missing.joblib")
    with pytest.raises(PredictionArtifactError, match="not available"):
        predict_travel_time(
            {name: 1.0 for name in FEATURE_NAMES},
            artifact_path=tmp_path / "missing.joblib",
        )
    with pytest.raises(PredictionFeatureError, match="finite"):
        predict_travel_time(
            {**{name: 1.0 for name in FEATURE_NAMES}, "total_distance_m": float("inf")},
            artifact_path=tmp_path / "missing.joblib",
        )


def test_prediction_rejects_nonfinite_and_invalid_scenario_inputs():
    with pytest.raises(PredictionFeatureError, match="positive"):
        extract_route_features(
            [RouteScenarioSegment(5, 0, 10, NOW)],
            float("nan"),
            now=NOW,
        )
    with pytest.raises(PredictionFeatureError, match="capacity_people"):
        extract_route_features(
            [RouteScenarioSegment(5, 1, 0, NOW)],
            1.2,
            now=NOW,
        )


def test_route_prediction_validates_topology_and_refuses_blocked_segments(tmp_path):
    _, artifact_path = train_test_artifact(tmp_path / "model.joblib")
    graph = nx.MultiDiGraph(campus_id=str(CAMPUS))
    graph.add_nodes_from((str(NODE_A), str(NODE_B), str(NODE_C)))
    graph.add_edge(
        str(NODE_A), str(NODE_B), key=str(EDGE_AB), id=str(EDGE_AB), distance=5.0
    )
    graph.add_edge(
        str(NODE_B), str(NODE_C), key=str(EDGE_BC), id=str(EDGE_BC), distance=7.0
    )
    request = RouteTimePredictionRequest(
        path_node_ids=[NODE_A, NODE_B, NODE_C],
        edge_ids=[EDGE_AB, EDGE_BC],
        base_walking_speed_mps=1.2,
    )

    response = predict_specified_route(
        graph,
        EmergencyConditionSnapshot((), (), ()),
        request,
        artifact_path=artifact_path,
        now=NOW,
    )
    assert response.route_distance_m == 12
    assert response.live_crowd_measurements_used is False
    assert response.edge_measurement_statuses[0].measurement_status == "missing"

    with pytest.raises(RoutePredictionBlockedError):
        predict_specified_route(
            graph,
            EmergencyConditionSnapshot((), (), (str(EDGE_AB),)),
            request,
            artifact_path=artifact_path,
            now=NOW,
        )

    malformed = request.model_copy(update={"edge_ids": [EDGE_BC, EDGE_AB]})
    with pytest.raises(RoutePredictionInputError, match="does not connect"):
        predict_specified_route(
            graph,
            EmergencyConditionSnapshot((), (), ()),
            malformed,
            artifact_path=artifact_path,
            now=NOW,
        )