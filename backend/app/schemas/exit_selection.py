"""Response schemas for distance-based campus exit selection."""

from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.routing import RouteStep


class ExitSelectionRequest(BaseModel):
    """Starting point used to evaluate all eligible campus exits."""

    start_node_id: UUID
    blocked_edge_ids: list[UUID] = Field(default_factory=list)
    blocked_node_ids: list[UUID] = Field(default_factory=list)


class EvaluatedExit(BaseModel):
    """Reachability result for one persisted campus exit."""

    exit_id: UUID
    node_id: UUID
    name: str
    exit_type: str
    reachable: bool
    distance_m: Optional[float] = None
    exclusion_reason: Optional[Literal["inactive", "blocked", "unreachable"]] = None


class ExitSelectionResponse(BaseModel):
    """Nearest reachable active exit by remaining physical distance, not safety."""

    status: Literal["route_found", "no_route"]
    campus_id: UUID
    start_node_id: UUID
    selected_exit_id: Optional[UUID]
    selected_exit_node_id: Optional[UUID]
    selected_exit_name: Optional[str]
    selected_exit_type: Optional[str]
    path_node_ids: list[UUID]
    total_distance_m: Optional[float]
    steps: list[RouteStep]
    active_emergency_ids: list[UUID]
    evaluated_exits: list[EvaluatedExit]
    blocked_edge_count: int = 0
    blocked_node_count: int = 0
    selection_objective: Literal["shortest_physical_distance_among_eligible_exits"] = (
        "shortest_physical_distance_among_eligible_exits"
    )
    safety_notice: Literal[
        "Distance-based exit selection is not a safety guarantee."
    ] = "Distance-based exit selection is not a safety guarantee."