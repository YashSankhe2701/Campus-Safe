"""Schemas for explicit-scenario crowd and travel-time routing."""

from datetime import datetime
from math import isfinite
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class EdgeCrowdScenario(BaseModel):
    """Caller-supplied scenario sample; never represented as live campus data."""

    edge_id: UUID
    occupancy_people: int = Field(ge=0)
    capacity_people: int = Field(gt=0)
    observed_at: Optional[datetime] = None


class CongestionRouteRequest(BaseModel):
    """Route endpoints and explicit, non-persisted edge scenario measurements."""

    start_node_id: UUID
    destination_node_id: UUID
    base_walking_speed_mps: float = Field(gt=0, allow_inf_nan=False)
    edge_scenarios: list[EdgeCrowdScenario] = Field(default_factory=list)

    @field_validator("base_walking_speed_mps")
    @classmethod
    def base_speed_must_be_finite(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("base_walking_speed_mps must be finite")
        return value


class CongestionRouteStep(BaseModel):
    from_node_id: UUID
    to_node_id: UUID
    edge_id: UUID
    distance_m: float = Field(gt=0, allow_inf_nan=False)
    estimated_travel_time_s: float = Field(ge=0, allow_inf_nan=False)
    density_ratio: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    congestion_score: Optional[float] = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    measurement_status: Literal["valid", "missing", "missing_timestamp", "stale"]
    over_capacity: bool


class CongestionRouteResponse(BaseModel):
    campus_id: UUID
    start_node_id: UUID
    destination_node_id: UUID
    path_node_ids: list[UUID]
    total_distance_m: float = Field(ge=0, allow_inf_nan=False)
    estimated_travel_time_s: float = Field(ge=0, allow_inf_nan=False)
    steps: list[CongestionRouteStep]
    data_mode: Literal["explicit_scenario_inputs"] = "explicit_scenario_inputs"
    live_crowd_measurements_used: Literal[False] = False
    unknown_measurement_edge_count: int = Field(ge=0)