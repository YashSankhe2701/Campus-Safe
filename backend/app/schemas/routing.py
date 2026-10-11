"""Request and response schemas for baseline campus routing."""

from math import isfinite
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ShortestRouteRequest(BaseModel):
    """Node identifiers defining a campus-scoped shortest route request."""

    start_node_id: UUID
    destination_node_id: UUID


class RouteStep(BaseModel):
    """One selected physical edge along the route."""

    from_node_id: UUID
    to_node_id: UUID
    edge_id: UUID
    distance_m: float = Field(gt=0)

    @field_validator("distance_m")
    @classmethod
    def distance_must_be_finite(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("distance_m must be finite")
        return value


class ShortestRouteResponse(BaseModel):
    """Distance-minimizing path and the exact stored edge selected per step."""

    campus_id: UUID
    start_node_id: UUID
    destination_node_id: UUID
    path_node_ids: list[UUID]
    total_distance_m: float = Field(ge=0)
    steps: list[RouteStep]

    @field_validator("total_distance_m")
    @classmethod
    def total_distance_must_be_finite(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("total_distance_m must be finite")
        return value


class EmergencyAwareRouteResponse(ShortestRouteResponse):
    """Blockage-aware route; risk scores are not currently used for weighting."""

    active_emergency_ids: list[UUID]
    blocked_edge_count: int
    blocked_node_count: int
    risk_weighting_applied: Literal[False] = False
    risk_weighting_status: Literal["unavailable_unvalidated_semantics"] = (
        "unavailable_unvalidated_semantics"
    )