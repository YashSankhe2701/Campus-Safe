"""Baseline shortest-distance routing over a loaded campus graph."""

import math
from typing import Any
from uuid import UUID

import networkx as nx

from app.schemas.routing import RouteStep, ShortestRouteResponse


class RouteNodeNotFoundError(LookupError):
    """Raised when a requested start or destination node is absent."""


class NoRouteFoundError(LookupError):
    """Raised when no directed path connects the requested nodes."""


class InvalidRouteGraphError(ValueError):
    """Raised when the loaded graph contains invalid route weights or identifiers."""


def _minimum_parallel_distance(edge_data: dict[Any, dict[str, Any]]) -> float:
    """NetworkX multigraph weight callback returning the cheapest parallel arc."""
    distances = [attributes.get("distance") for attributes in edge_data.values()]
    if not distances:
        raise InvalidRouteGraphError("A traversable edge has no distance metadata.")
    if any(
        isinstance(distance, bool)
        or not isinstance(distance, (int, float))
        or not math.isfinite(distance)
        or distance <= 0
        for distance in distances
    ):
        raise InvalidRouteGraphError("Every traversable edge must have positive finite distance.")
    return float(min(distances))


def _networkx_distance_weight(
    _from_node: str,
    _to_node: str,
    edge_data: dict[Any, dict[str, Any]],
) -> float:
    return _minimum_parallel_distance(edge_data)


def _edge_id(attributes: dict[str, Any]) -> UUID:
    try:
        return UUID(str(attributes.get("id")))
    except (ValueError, TypeError, AttributeError) as exc:
        raise InvalidRouteGraphError("A traversable edge has an invalid ID.") from exc


def calculate_shortest_route(
    graph: nx.MultiDiGraph,
    start_node_id: UUID | str,
    destination_node_id: UUID | str,
) -> ShortestRouteResponse:
    """Use physical distance as Dijkstra's weight; do not modify ``graph``."""
    if not isinstance(graph, nx.MultiDiGraph) or not graph.is_directed():
        raise InvalidRouteGraphError("Campus graph must be a directed NetworkX MultiDiGraph.")

    start = str(start_node_id)
    destination = str(destination_node_id)
    try:
        start_uuid = UUID(start)
        destination_uuid = UUID(destination)
    except (ValueError, TypeError, AttributeError) as exc:
        raise RouteNodeNotFoundError("Start or destination node ID is invalid.") from exc

    if start not in graph:
        raise RouteNodeNotFoundError("Start node was not found in this campus.")
    if destination not in graph:
        raise RouteNodeNotFoundError("Destination node was not found in this campus.")

    try:
        total_distance, path = nx.single_source_dijkstra(
            graph,
            source=start,
            target=destination,
            weight=_networkx_distance_weight,
        )
    except nx.NetworkXNoPath as exc:
        raise NoRouteFoundError("No route connects the requested nodes.") from exc

    steps: list[RouteStep] = []
    for from_node, to_node in zip(path, path[1:]):
        parallel_edges = graph.get_edge_data(from_node, to_node)
        if not parallel_edges:
            raise InvalidRouteGraphError("Dijkstra returned a path with a missing edge.")
        selected_key, selected_attributes = min(
            parallel_edges.items(),
            key=lambda item: (
                _minimum_parallel_distance({item[0]: item[1]}),
                str(item[1].get("id", item[0])),
            ),
        )
        selected_distance = _minimum_parallel_distance(
            {selected_key: selected_attributes}
        )
        steps.append(
            RouteStep(
                from_node_id=UUID(from_node),
                to_node_id=UUID(to_node),
                edge_id=_edge_id(selected_attributes),
                distance_m=selected_distance,
            )
        )

    step_distance = math.fsum(step.distance_m for step in steps)
    if not math.isclose(step_distance, total_distance, rel_tol=1e-12, abs_tol=1e-12):
        raise InvalidRouteGraphError("Route distance does not match selected edge details.")

    return ShortestRouteResponse(
        campus_id=UUID(str(graph.graph["campus_id"])),
        start_node_id=start_uuid,
        destination_node_id=destination_uuid,
        path_node_ids=[UUID(node_id) for node_id in path],
        total_distance_m=step_distance,
        steps=steps,
    )


__all__ = [
    "InvalidRouteGraphError",
    "NoRouteFoundError",
    "RouteNodeNotFoundError",
    "calculate_shortest_route",
]