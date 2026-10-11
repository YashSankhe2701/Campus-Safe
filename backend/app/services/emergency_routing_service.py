"""Initial blockage-aware routing using persisted emergency conditions."""

import asyncio
from typing import Protocol
from uuid import UUID

import networkx as nx

from app.database.emergency_repository import (
    EmergencyConditionDataError,
    EmergencyConditionSnapshot,
    PostgresEmergencyConditionRepository,
)
from app.schemas.routing import ShortestRouteResponse
from app.services.graph_service import load_campus_graph
from app.services.routing_service import (
    NoRouteFoundError,
    RouteNodeNotFoundError,
    calculate_shortest_route,
)


class EmergencyConditionRepository(Protocol):
    def load_conditions(self, campus_id: str) -> EmergencyConditionSnapshot: ...


def build_unblocked_graph(
    graph: nx.MultiDiGraph,
    conditions: EmergencyConditionSnapshot,
) -> nx.MultiDiGraph:
    """Return a copy with persisted blocked nodes and edges removed."""
    blocked_nodes = set(conditions.blocked_node_ids)
    blocked_edges = set(conditions.blocked_edge_ids)
    loaded_nodes = set(graph.nodes)
    loaded_edge_ids = {
        str(attributes.get("id"))
        for _, _, _, attributes in graph.edges(keys=True, data=True)
    }
    if not blocked_nodes <= loaded_nodes:
        raise EmergencyConditionDataError("Condition references a node outside the loaded campus graph.")
    if not blocked_edges <= loaded_edge_ids:
        raise EmergencyConditionDataError("Condition references an edge outside the loaded campus graph.")

    routing_graph = graph.copy()
    if blocked_edges:
        routing_graph.remove_edges_from(
            [
                (from_node, to_node, key)
                for from_node, to_node, key, attributes in routing_graph.edges(
                    keys=True, data=True
                )
                if str(attributes.get("id")) in blocked_edges
            ]
        )
    if blocked_nodes:
        routing_graph.remove_nodes_from(blocked_nodes)
    return routing_graph


def calculate_emergency_aware_route(
    graph: nx.MultiDiGraph,
    conditions: EmergencyConditionSnapshot,
    start_node_id: UUID | str,
    destination_node_id: UUID | str,
) -> ShortestRouteResponse:
    """Remove applicable blocked topology from a fresh copy, then minimize metres.

    Persisted risk scores are not weighted because their semantics/provenance are
    not defined by the current schema or documentation. Missing risk is therefore
    neither fabricated nor interpreted as zero risk.
    """
    start = str(start_node_id)
    destination = str(destination_node_id)
    if start not in graph:
        raise RouteNodeNotFoundError("Start node was not found in this campus.")
    if destination not in graph:
        raise RouteNodeNotFoundError("Destination node was not found in this campus.")

    blocked_nodes = set(conditions.blocked_node_ids)
    routing_graph = build_unblocked_graph(graph, conditions)

    try:
        return calculate_shortest_route(
            routing_graph,
            start_node_id,
            destination_node_id,
        )
    except RouteNodeNotFoundError as exc:
        if start in blocked_nodes or destination in blocked_nodes:
            raise NoRouteFoundError("No route exists because an endpoint is blocked.") from exc
        raise


async def load_emergency_aware_route(
    campus_id: str,
    start_node_id: UUID | str,
    destination_node_id: UUID | str,
    *,
    condition_repository: EmergencyConditionRepository | None = None,
) -> tuple[ShortestRouteResponse, EmergencyConditionSnapshot]:
    """Load fresh topology and condition snapshots, then calculate a route."""
    graph = await load_campus_graph(campus_id)
    repository = condition_repository or PostgresEmergencyConditionRepository()
    conditions = await asyncio.to_thread(
        repository.load_conditions,
        str(UUID(campus_id)),
    )
    route = calculate_emergency_aware_route(
        graph,
        conditions,
        start_node_id,
        destination_node_id,
    )
    return route, conditions


__all__ = [
    "EmergencyConditionDataError",
    "build_unblocked_graph",
    "calculate_emergency_aware_route",
    "load_emergency_aware_route",
]