"""Artifact-backed prediction of scenario travel time for one supplied route."""

from dataclasses import dataclass
import math
from pathlib import Path
from typing import Any

import joblib

from app.services.prediction_features import FEATURE_NAMES, PredictionFeatureError

import os

MODEL_VERSION = "synthetic-route-time-rf-v1"
TRAINING_DATA_TYPE = "synthetic_phase4_formula_labels"


def resolve_model_artifact_path() -> Path:
    """
    Resolve the offline trained model artifact path robustly.

    Priority:
    1. EVACUATION_MODEL_PATH environment variable (if explicitly set).
    2. Monorepo root relative to app/services/ (3 levels up).
    3. CWD-relative path: CWD / 'ai' / 'prediction' / 'artifacts' / 'evacuation_time_rf.joblib'.
    4. CWD-relative artifacts path: CWD / 'artifacts' / 'evacuation_time_rf.joblib'.
    5. Backend-relative artifacts path: parents[1] / 'artifacts' / 'evacuation_time_rf.joblib'.
    """
    env_path = os.getenv("EVACUATION_MODEL_PATH")
    if env_path:
        return Path(env_path)

    candidates = [
        Path(__file__).resolve().parents[3] / "ai" / "prediction" / "artifacts" / "evacuation_time_rf.joblib",
        Path.cwd() / "ai" / "prediction" / "artifacts" / "evacuation_time_rf.joblib",
        Path.cwd() / "artifacts" / "evacuation_time_rf.joblib",
        Path(__file__).resolve().parents[1] / "artifacts" / "evacuation_time_rf.joblib",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate

    return candidates[0]


DEFAULT_MODEL_PATH = resolve_model_artifact_path()
VALIDATION_LIMITATION = (
    "Trained and evaluated on synthetic scenarios generated from the Phase 4 formula; "
    "not validated against real evacuation observations."
)


class PredictionArtifactError(RuntimeError):
    """Raised when the local model artifact is absent or incompatible."""


@dataclass(frozen=True)
class TravelTimePrediction:
    predicted_travel_time_s: float
    model_version: str
    training_data_type: str
    validation_limitation: str
    features: dict[str, float]


def predict_travel_time(
    features: dict[str, float],
    *,
    artifact_path: str | Path = DEFAULT_MODEL_PATH,
) -> TravelTimePrediction:
    """Load the offline artifact and predict one route; never trains in-request."""
    if set(features) != set(FEATURE_NAMES):
        raise PredictionFeatureError("Prediction feature names do not match the trained model schema.")
    ordered_features: list[float] = []
    for name in FEATURE_NAMES:
        value: Any = features[name]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise PredictionFeatureError(f"Feature {name} must be numeric and finite.")
        if not math.isfinite(value):
            raise PredictionFeatureError(f"Feature {name} must be numeric and finite.")
        ordered_features.append(float(value))
    if features["total_distance_m"] <= 0 or features["base_walking_speed_mps"] <= 0:
        raise PredictionFeatureError("Distance and walking speed must be positive.")
    if features["route_edge_count"] < 1:
        raise PredictionFeatureError("route_edge_count must be at least one.")
    if not float(features["route_edge_count"]).is_integer():
        raise PredictionFeatureError("route_edge_count must be an integer count.")
    if not 0 <= features["mean_congestion_score"] <= 1:
        raise PredictionFeatureError("mean_congestion_score must be within [0, 1].")
    if not 0 <= features["peak_congestion_score"] <= 1:
        raise PredictionFeatureError("peak_congestion_score must be within [0, 1].")
    if features["distance_weighted_congestion_m"] < 0:
        raise PredictionFeatureError("distance_weighted_congestion_m cannot be negative.")
    if features["over_capacity_edge_count"] < 0:
        raise PredictionFeatureError("over_capacity_edge_count cannot be negative.")
    if (
        not float(features["over_capacity_edge_count"]).is_integer()
        or features["over_capacity_edge_count"] > features["route_edge_count"]
    ):
        raise PredictionFeatureError("over_capacity_edge_count must be a valid edge count.")
    if features["mean_congestion_score"] > features["peak_congestion_score"]:
        raise PredictionFeatureError("Mean congestion cannot exceed peak congestion.")
    if features["distance_weighted_congestion_m"] > features["total_distance_m"]:
        raise PredictionFeatureError("Distance-weighted congestion cannot exceed route distance.")
    if not 0 <= features["valid_measurement_edge_fraction"] <= 1:
        raise PredictionFeatureError("valid_measurement_edge_fraction must be within [0, 1].")

    model_path = Path(artifact_path)
    if not model_path.is_file():
        raise PredictionArtifactError("Trained synthetic prediction artifact is not available.")
    try:
        bundle = joblib.load(model_path)
    except Exception as exc:
        raise PredictionArtifactError("Prediction artifact could not be loaded.") from exc
    if (
        not isinstance(bundle, dict)
        or bundle.get("metadata", {}).get("feature_names") != list(FEATURE_NAMES)
        or bundle.get("metadata", {}).get("training_data_type") != TRAINING_DATA_TYPE
    ):
        raise PredictionArtifactError("Prediction artifact feature schema is incompatible.")
    metadata = bundle["metadata"]
    if metadata.get("model_version") != MODEL_VERSION:
        raise PredictionArtifactError("Prediction artifact model version is incompatible.")
    model = bundle.get("model")
    if model is None or not callable(getattr(model, "predict", None)):
        raise PredictionArtifactError("Prediction artifact does not contain a usable estimator.")

    prediction = float(model.predict([ordered_features])[0])
    if not math.isfinite(prediction) or prediction < 0:
        raise PredictionArtifactError("Model produced an invalid travel-time prediction.")
    return TravelTimePrediction(
        predicted_travel_time_s=prediction,
        model_version=MODEL_VERSION,
        training_data_type=TRAINING_DATA_TYPE,
        validation_limitation=VALIDATION_LIMITATION,
        features={name: float(features[name]) for name in FEATURE_NAMES},
    )


__all__ = [
    "DEFAULT_MODEL_PATH",
    "MODEL_VERSION",
    "PredictionArtifactError",
    "TRAINING_DATA_TYPE",
    "TravelTimePrediction",
    "VALIDATION_LIMITATION",
    "predict_travel_time",
    "resolve_model_artifact_path",
]