"""Uncalibrated scenario crowd-density and edge travel-time model.

This module does not read persisted crowd fields because their units and
measurement provenance are not established in the current database schema.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import math
from typing import Literal

MEASUREMENT_MAX_AGE = timedelta(minutes=15)


class CrowdModelInputError(ValueError):
    """Raised for invalid occupancy, capacity, speed, distance, or timestamps."""


MeasurementStatus = Literal["valid", "missing", "missing_timestamp", "stale"]


@dataclass(frozen=True)
class CrowdMetrics:
    """Density outputs; ratios/scores are dimensionless."""

    measurement_status: MeasurementStatus
    density_ratio: float | None
    congestion_score: float | None
    over_capacity: bool


@dataclass(frozen=True)
class TravelTimeEstimate:
    """Scenario traversal estimate with explicit SI units."""

    distance_m: float
    base_speed_mps: float
    effective_speed_mps: float
    estimated_time_s: float
    congestion_score: float | None
    measurement_status: MeasurementStatus


def calculate_crowd_metrics(
    occupancy_people: int | None,
    capacity_people: int | None,
    *,
    observed_at: datetime | None,
    now: datetime | None = None,
    max_age: timedelta = MEASUREMENT_MAX_AGE,
) -> CrowdMetrics:
    """Calculate a clamped occupancy/capacity ratio for a fresh explicit sample.

    The unclamped ratio is retained for overload visibility. Congestion score is
    ``min(occupancy / capacity, 1)`` and represents a linear scenario index, not
    an empirically validated crowd-flow relationship.
    """
    if occupancy_people is None or capacity_people is None:
        return CrowdMetrics("missing", None, None, False)
    if isinstance(occupancy_people, bool) or not isinstance(occupancy_people, int):
        raise CrowdModelInputError("occupancy_people must be a non-negative integer.")
    if occupancy_people < 0:
        raise CrowdModelInputError("occupancy_people must be a non-negative integer.")
    if isinstance(capacity_people, bool) or not isinstance(capacity_people, int):
        raise CrowdModelInputError("capacity_people must be a positive integer.")
    if capacity_people <= 0:
        raise CrowdModelInputError("capacity_people must be a positive integer.")
    if max_age < timedelta(0):
        raise CrowdModelInputError("max_age must be non-negative.")
    if observed_at is None:
        return CrowdMetrics("missing_timestamp", None, None, False)
    current_time = now or datetime.now(timezone.utc)
    if observed_at.tzinfo is None or current_time.tzinfo is None:
        raise CrowdModelInputError("Measurement timestamps must include a timezone.")
    age = current_time - observed_at
    if age < timedelta(0):
        raise CrowdModelInputError("observed_at cannot be in the future.")
    if age > max_age:
        return CrowdMetrics("stale", None, None, False)

    ratio = occupancy_people / capacity_people
    return CrowdMetrics(
        measurement_status="valid",
        density_ratio=ratio,
        congestion_score=min(ratio, 1.0),
        over_capacity=occupancy_people > capacity_people,
    )


def estimate_travel_time(
    distance_m: float,
    base_speed_mps: float,
    congestion_score: float | None,
    measurement_status: MeasurementStatus,
) -> TravelTimeEstimate:
    """Estimate time as ``distance_m / base_speed_mps * (1 + congestion)``.

    Missing/stale samples use congestion zero only as an explicit unadjusted
    baseline and preserve their status; this is not evidence of low congestion.
    A blocked edge must be excluded before calling this function.
    """
    for value, field in ((distance_m, "distance_m"), (base_speed_mps, "base_speed_mps")):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise CrowdModelInputError(f"{field} must be a positive finite number.")
        if not math.isfinite(value) or value <= 0:
            raise CrowdModelInputError(f"{field} must be a positive finite number.")
    if congestion_score is None:
        adjustment = 0.0
    else:
        if isinstance(congestion_score, bool) or not isinstance(congestion_score, (int, float)):
            raise CrowdModelInputError("congestion_score must be between 0 and 1.")
        if not math.isfinite(congestion_score) or not 0 <= congestion_score <= 1:
            raise CrowdModelInputError("congestion_score must be between 0 and 1.")
        adjustment = float(congestion_score)

    effective_speed = float(base_speed_mps) / (1.0 + adjustment)
    estimated_time = float(distance_m) / effective_speed
    if not math.isfinite(effective_speed) or effective_speed <= 0 or not math.isfinite(estimated_time):
        raise CrowdModelInputError("Travel-time estimate is not finite and traversable.")
    return TravelTimeEstimate(
        distance_m=float(distance_m),
        base_speed_mps=float(base_speed_mps),
        effective_speed_mps=effective_speed,
        estimated_time_s=estimated_time,
        congestion_score=None if congestion_score is None else float(congestion_score),
        measurement_status=measurement_status,
    )


__all__ = [
    "CrowdMetrics",
    "CrowdModelInputError",
    "MeasurementStatus",
    "TravelTimeEstimate",
    "calculate_crowd_metrics",
    "estimate_travel_time",
]