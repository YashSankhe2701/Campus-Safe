"""Response schemas for campus graph metadata."""

from typing import Dict, Optional
from uuid import UUID

from pydantic import BaseModel


class CampusGraphSummaryResponse(BaseModel):
    """Public graph metadata; intentionally excludes graph internals and DB data."""

    campus_id: UUID
    campus_name: Optional[str]
    graph_type: str
    node_count: int
    edge_count: int
    arc_count: int
    exit_count: int
    assembly_point_count: int
    node_type_counts: Dict[str, int]
    directed_edge_count: int
    bidirectional_edge_count: int