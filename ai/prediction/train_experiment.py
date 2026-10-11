"""Generate synthetic route scenarios and evaluate an offline RF experiment.

Run from the repository root or backend directory with the backend environment:
    python ai/prediction/train_experiment.py
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPOSITORY_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupShuffleSplit
import sklearn
import joblib

from app.services.evacuation_prediction import MODEL_VERSION, TRAINING_DATA_TYPE
from app.services.prediction_features import (
    FEATURE_NAMES,
    FEATURE_UNITS,
    RouteScenarioSegment,
    extract_route_features,
)

DEFAULT_RANDOM_SEED = 20261010
SYNTHETIC_OBSERVED_AT = datetime(2025, 1, 1, tzinfo=timezone.utc)
DEFAULT_ARTIFACT_DIR = REPOSITORY_ROOT / "ai" / "prediction" / "artifacts"


@dataclass(frozen=True)
class SyntheticExample:
    route_template_id: str
    features: dict[str, float]
    estimated_travel_time_s: float
    analytical_baseline_s: float


def generate_synthetic_dataset(
    *,
    route_template_count: int = 300,
    scenarios_per_template: int = 4,
    random_seed: int = DEFAULT_RANDOM_SEED,
) -> list[SyntheticExample]:
    """Generate deterministic route templates with occupancy scenario variants.

    Synthetic ranges: 1-8 edges/template, 3-35 m/edge, 0.7-1.8 m/s walking
    speed, 20-160 persons/capacity/edge, and 0-150% of capacity occupancy.
    Labels are summed outputs of the existing Phase 4 formula, not measurements.
    """
    if route_template_count < 5 or scenarios_per_template < 2:
        raise ValueError("Use at least five route templates and two scenarios per template.")
    rng = random.Random(random_seed)
    examples: list[SyntheticExample] = []

    for template_number in range(route_template_count):
        route_template_id = f"route-template-{template_number:05d}"
        edge_count = rng.randint(1, 8)
        base_speed = rng.uniform(0.7, 1.8)
        edge_specs = [
            (rng.uniform(3.0, 35.0), rng.randint(20, 160))
            for _ in range(edge_count)
        ]

        for scenario_number in range(scenarios_per_template):
            segments = []
            for distance_m, capacity_people in edge_specs:
                if scenario_number == 0:
                    occupancy = 0
                elif scenario_number == 1:
                    occupancy = rng.randint(0, capacity_people)
                elif scenario_number == 2:
                    occupancy = rng.randint(capacity_people, math.ceil(capacity_people * 1.5))
                else:
                    occupancy = rng.randint(0, math.ceil(capacity_people * 1.5))
                segments.append(
                    RouteScenarioSegment(
                        distance_m=distance_m,
                        occupancy_people=occupancy,
                        capacity_people=capacity_people,
                        observed_at=SYNTHETIC_OBSERVED_AT,
                    )
                )

            extracted = extract_route_features(
                segments,
                base_speed,
                now=SYNTHETIC_OBSERVED_AT,
            )
            examples.append(
                SyntheticExample(
                    route_template_id=route_template_id,
                    features=extracted.features,
                    estimated_travel_time_s=extracted.analytical_time_s,
                    analytical_baseline_s=extracted.analytical_time_s,
                )
            )
    return examples


def _regression_metrics(actual: list[float], predicted: list[float]) -> dict[str, float]:
    return {
        "mae_seconds": float(mean_absolute_error(actual, predicted)),
        "rmse_seconds": float(
            math.sqrt(sum((truth - estimate) ** 2 for truth, estimate in zip(actual, predicted, strict=True)) / len(actual))
        ),
        "r2": float(r2_score(actual, predicted)),
    }


def train_and_evaluate(
    output_dir: str | Path = DEFAULT_ARTIFACT_DIR,
    *,
    route_template_count: int = 300,
    scenarios_per_template: int = 4,
    random_seed: int = DEFAULT_RANDOM_SEED,
    n_estimators: int = 250,
) -> dict[str, Any]:
    """Group-split by route template, compare analytical baseline and RF, save outputs."""
    from sklearn.model_selection import GroupShuffleSplit

    examples = generate_synthetic_dataset(
        route_template_count=route_template_count,
        scenarios_per_template=scenarios_per_template,
        random_seed=random_seed,
    )
    features = [example.features for example in examples]
    labels = [example.estimated_travel_time_s for example in examples]
    groups = [example.route_template_id for example in examples]
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=random_seed)
    train_indices, test_indices = next(
        splitter.split(features, labels, groups=groups)
    )

    x_train = [[features[index][name] for name in FEATURE_NAMES] for index in train_indices]
    y_train = [labels[index] for index in train_indices]
    x_test = [[features[index][name] for name in FEATURE_NAMES] for index in test_indices]
    y_test = [labels[index] for index in test_indices]
    baseline_predictions = [examples[index].analytical_baseline_s for index in test_indices]

    model = RandomForestRegressor(
        n_estimators=n_estimators,
        max_features=1.0,
        min_samples_leaf=2,
        random_state=random_seed,
        n_jobs=1,
    )
    model.fit(x_train, y_train)
    forest_predictions = [float(value) for value in model.predict(x_test)]
    if any(not math.isfinite(value) or value < 0 for value in forest_predictions):
        raise RuntimeError("Random forest produced an invalid travel-time prediction.")

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    model_path = output_path / "evacuation_time_rf.joblib"
    dataset_path = output_path / "synthetic_route_scenarios.csv"
    report_path = output_path / "evaluation.json"
    metadata = {
        "model_version": MODEL_VERSION,
        "training_data_type": TRAINING_DATA_TYPE,
        "target": "estimated_travel_time_s",
        "feature_names": list(FEATURE_NAMES),
        "feature_units": FEATURE_UNITS,
        "model_class": "RandomForestRegressor",
        "model_parameters": {
            "n_estimators": n_estimators,
            "max_features": 1.0,
            "min_samples_leaf": 2,
            "random_state": random_seed,
            "n_jobs": 1,
        },
        "random_seed": random_seed,
        "split": "GroupShuffleSplit(test_size=0.2) by route_template_id",
        "validation_limitation": (
            "Labels are generated by the Phase 4 formula; held-out synthetic performance "
            "does not demonstrate real-world evacuation-time accuracy."
        ),
    }
    joblib.dump({"model": model, "metadata": metadata}, model_path)

    with dataset_path.open("w", newline="", encoding="utf-8") as csv_file:
        fieldnames = ["route_template_id", *FEATURE_NAMES, "estimated_travel_time_s"]
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        for example in examples:
            writer.writerow(
                {
                    "route_template_id": example.route_template_id,
                    **example.features,
                    "estimated_travel_time_s": example.estimated_travel_time_s,
                }
            )

    report = {
        "model_version": MODEL_VERSION,
        "training_data_type": TRAINING_DATA_TYPE,
        "scikit_learn_version": sklearn.__version__,
        "random_seed": random_seed,
        "generated_row_count": len(examples),
        "route_template_count": len(set(groups)),
        "train_row_count": len(train_indices),
        "test_row_count": len(test_indices),
        "train_template_count": len({groups[index] for index in train_indices}),
        "test_template_count": len({groups[index] for index in test_indices}),
        "target": "estimated_travel_time_s",
        "feature_names": list(FEATURE_NAMES),
        "baseline": {
            "definition": "Phase 4 analytical sum of distance_m/base_speed_mps*(1+congestion_score)",
            **_regression_metrics(y_test, baseline_predictions),
        },
        "random_forest": _regression_metrics(y_test, forest_predictions),
        "random_forest_outperformed_baseline_on_mae": (
            _regression_metrics(y_test, forest_predictions)["mae_seconds"]
            < _regression_metrics(y_test, baseline_predictions)["mae_seconds"]
        ),
        "limitations": [
            "Synthetic labels are generated by the Phase 4 scenario equation.",
            "Held-out synthetic metrics do not establish real-world accuracy.",
            "Target is per-person travel time along one specified route, not group bottleneck or whole-campus clearance time.",
        ],
        "artifacts": {
            "model": str(model_path),
            "dataset": str(dataset_path),
            "evaluation": str(report_path),
        },
    }
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_ARTIFACT_DIR)
    parser.add_argument("--route-templates", type=int, default=300)
    parser.add_argument("--scenarios-per-template", type=int, default=4)
    parser.add_argument("--seed", type=int, default=DEFAULT_RANDOM_SEED)
    parser.add_argument("--estimators", type=int, default=250)
    args = parser.parse_args()
    result = train_and_evaluate(
        args.output_dir,
        route_template_count=args.route_templates,
        scenarios_per_template=args.scenarios_per_template,
        random_seed=args.seed,
        n_estimators=args.estimators,
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()