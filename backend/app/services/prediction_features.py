"""Shared route feature engineering for training and prediction."""

from dataclasses import dataclass
from datetime import datetime
import math

from app.services.crowd_model import (
    CrowdMetrics,
    CrowdModelInputError,
    MeasurementStatus,
    calculate_crowd_metrics,
    estimate_travel_time,
)

FEATURE_NAMES = (
    "total_distance_m",
    "base_walking_speed_mps",
    "route_edge_count",
    "distance_weighted_congestion_m",
    "mean_congestion_score",
    "peak_congestion_score",
    "over_capacity_edge_count",
    "valid_measurement_edge_fraction",
)

FEATURE_UNITS = {
    "total_distance_m": "m",
    "base_walking_speed_mps": "m/s",
    "route_edge_count": "count",
    "distance_weighted_congestion_m": "m (dimensionless score weighted by distance)",
    "mean_congestion_score": "dimensionless [0, 1]",
    "peak_congestion_score": "dimensionless [0, 1]",
    "over_capacity_edge_count": "count",
    "valid_measurement_edge_fraction": "fraction [0, 1]",
}


class PredictionFeatureError(ValueError):
    """Raised when route features cannot be calculated or validated."""


@dataclass(frozen=True)
class RouteScenarioSegment:
    """One route edge and optional explicit occupancy scenario sample."""

    distance_m: float
    occupancy_people: int | None = None
    capacity_people: int | None = None
    observed_at: datetime | None = None


@dataclass(frozen=True)
class ExtractedRouteFeatures:
    """Ordered model features plus analytical Phase 4 target/baseline."""

    features: dict[str, float]
    analytical_time_s: float
    segment_metrics: tuple[CrowdMetrics, ...]
    segment_measurement_statuses: tuple[MeasurementStatus, ...]


def extract_route_features(
    segments: list[RouteScenarioSegment],
    base_walking_speed_mps: float,
    *,
    now: datetime | None = None,
) -> ExtractedRouteFeatures:
    """Build the exact feature vector and analytical travel-time baseline.

    Missing/stale segments have no congestion adjustment, matching the Phase 4
    scenario estimator, but are separately exposed through coverage and statuses.
    """
    if not segments:
        raise PredictionFeatureError("At least one route segment is required.")
    if (
        isinstance(base_walking_speed_mps, bool)
        or not isinstance(base_walking_speed_mps, (int, float))
        or not math.isfinite(base_walking_speed_mps)
        or base_walking_speed_mps <= 0
    ):
        raise PredictionFeatureError("base_walking_speed_mps must be positive and finite.")

    try:
        metrics = tuple(
            calculate_crowd_metrics(
                segment.occupancy_people,
                segment.capacity_people,
                observed_at=segment.observed_at,
                now=now,
            )
            for segment in segments
        )
        edge_times = tuple(
            estimate_travel_time(
                segment.distance_m,
                base_walking_speed_mps,
                crowd.congestion_score,
                crowd.measurement_status,
            ).estimated_time_s
            for segment, crowd in zip(segments, metrics, strict=True)
        )
    except CrowdModelInputError as exc:
        raise PredictionFeatureError(str(exc)) from exc

    total_distance = math.fsum(segment.distance_m for segment in segments)
    if not math.isfinite(total_distance) or total_distance <= 0:
        raise PredictionFeatureError("Route distance must be positive and finite.")
    scores = [metric.congestion_score or 0.0 for metric in metrics]
    features = {
        "total_distance_m": total_distance,
        "base_walking_speed_mps": float(base_walking_speed_mps),
        "route_edge_count": float(len(segments)),
        "distance_weighted_congestion_m": math.fsum(
            segment.distance_m * score for segment, score in zip(segments, scores, strict=True)
        ),
        "mean_congestion_score": math.fsum(scores) / len(scores),
        "peak_congestion_score": max(scores),
        "over_capacity_edge_count": float(sum(metric.over_capacity for metric in metrics)),
        "valid_measurement_edge_fraction": sum(
            metric.measurement_status == "valid" for metric in metrics
        ) / len(metrics),
    }
    if any(not math.isfinite(value) for value in features.values()):
        raise PredictionFeatureError("Extracted model features must be finite.")
    return ExtractedRouteFeatures(
        features=features,
        analytical_time_s=math.fsum(edge_times),
        segment_metrics=metrics,
        segment_measurement_statuses=tuple(metric.measurement_status for metric in metrics),
    )


__all__ = [
    "FEATURE_NAMES",
    "FEATURE_UNITS",
    "ExtractedRouteFeatures",
    "PredictionFeatureError",
    "RouteScenarioSegment",
    "extract_route_features",
]