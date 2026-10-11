"""Tests for the explicitly scenario-based crowd and time model."""

from datetime import datetime, timedelta, timezone

import pytest

from app.services.crowd_model import (
    CrowdModelInputError,
    calculate_crowd_metrics,
    estimate_travel_time,
)

NOW = datetime(2026, 10, 9, 12, tzinfo=timezone.utc)


def test_density_ratio_and_congestion_score_are_dimensionless_and_bounded():
    result = calculate_crowd_metrics(25, 100, observed_at=NOW, now=NOW)

    assert result.measurement_status == "valid"
    assert result.density_ratio == 0.25
    assert result.congestion_score == 0.25
    assert result.over_capacity is False


def test_zero_occupancy_has_zero_score():
    result = calculate_crowd_metrics(0, 20, observed_at=NOW, now=NOW)

    assert result.density_ratio == 0
    assert result.congestion_score == 0
    assert result.over_capacity is False


@pytest.mark.parametrize("capacity", [0, -1, True])
def test_nonpositive_or_boolean_capacity_is_rejected(capacity):
    with pytest.raises(CrowdModelInputError, match="capacity_people"):
        calculate_crowd_metrics(1, capacity, observed_at=NOW, now=NOW)


@pytest.mark.parametrize("occupancy", [-1, True, 1.5])
def test_invalid_occupancy_is_rejected(occupancy):
    with pytest.raises(CrowdModelInputError, match="occupancy_people"):
        calculate_crowd_metrics(occupancy, 10, observed_at=NOW, now=NOW)


def test_over_capacity_retains_ratio_and_clamps_score():
    result = calculate_crowd_metrics(12, 10, observed_at=NOW, now=NOW)

    assert result.density_ratio == 1.2
    assert result.congestion_score == 1
    assert result.over_capacity is True


@pytest.mark.parametrize(
    ("occupancy", "capacity", "observed_at", "status"),
    [
        (None, 10, NOW, "missing"),
        (2, 10, None, "missing_timestamp"),
        (2, 10, NOW - timedelta(minutes=16), "stale"),
    ],
)
def test_missing_or_stale_measurements_have_no_derived_score(
    occupancy, capacity, observed_at, status
):
    result = calculate_crowd_metrics(
        occupancy,
        capacity,
        observed_at=observed_at,
        now=NOW,
    )

    assert result.measurement_status == status
    assert result.density_ratio is None
    assert result.congestion_score is None


def test_future_or_timezone_naive_observation_is_rejected():
    with pytest.raises(CrowdModelInputError, match="future"):
        calculate_crowd_metrics(1, 10, observed_at=NOW + timedelta(seconds=1), now=NOW)
    with pytest.raises(CrowdModelInputError, match="timezone"):
        calculate_crowd_metrics(1, 10, observed_at=NOW.replace(tzinfo=None), now=NOW)


@pytest.mark.parametrize("score", [-0.1, 1.1, float("nan"), float("inf")])
def test_congestion_score_outside_unit_interval_is_rejected(score):
    with pytest.raises(CrowdModelInputError, match="congestion_score"):
        estimate_travel_time(10, 2, score, "valid")


def test_travel_time_formula_and_units():
    estimate = estimate_travel_time(10, 2, 0.5, "valid")

    assert estimate.distance_m == 10
    assert estimate.effective_speed_mps == pytest.approx(2 / 1.5)
    assert estimate.estimated_time_s == pytest.approx(7.5)


@pytest.mark.parametrize("status", ["missing", "missing_timestamp", "stale"])
def test_missing_or_stale_sample_uses_unadjusted_baseline_but_keeps_status(status):
    estimate = estimate_travel_time(10, 2, None, status)

    assert estimate.effective_speed_mps == 2
    assert estimate.estimated_time_s == 5
    assert estimate.measurement_status == status
    assert estimate.congestion_score is None


@pytest.mark.parametrize("distance,speed", [(0, 1), (1, 0), (float("inf"), 1), (1, float("nan"))])
def test_nonfinite_or_nonpositive_distance_and_speed_are_rejected(distance, speed):
    with pytest.raises(CrowdModelInputError):
        estimate_travel_time(distance, speed, 0, "valid")