"""A* shortest-distance routing over a loaded campus graph."""

import math
from typing import Any
from uuid import UUID

import networkx as nx

from app.schemas.routing import RouteStep, ShortestRouteResponse
from app.services.routing_service import (
    InvalidRouteGraphError,
    NoRouteFoundError,
    RouteNodeNotFoundError,
)


def zero_heuristic(_node: str, _destination: str) -> float:
    """Return the admissible zero heuristic until coordinate units are established."""
    return 0.0


def _minimum_parallel_distance(edge_data: dict[Any, dict[str, Any]]) -> float:
    distances = [attributes.get("distance") for attributes in edge_data.values()]
    if not distances or any(
        isinstance(distance, bool)
        or not isinstance(distance, (int, float))
        or not math.isfinite(distance)
        or distance <= 0
        for distance in distances
    ):
        raise InvalidRouteGraphError(
            "Every traversable edge must have positive finite distance."
        )
    return float(min(distances))


def _networkx_distance_weight(
    _from_node: str,
    _to_node: str,
    edge_data: dict[Any, dict[str, Any]],
) -> float:
    return _minimum_parallel_distance(edge_data)


def calculate_astar_route(
    graph: nx.MultiDiGraph,
    start_node_id: UUID | str,
    destination_node_id: UUID | str,
) -> ShortestRouteResponse:
    """Use NetworkX A* with physical distance and a zero heuristic."""
    if not isinstance(graph, nx.MultiDiGraph) or not graph.is_directed():
        raise InvalidRouteGraphError("Campus graph must be a directed NetworkX MultiDiGraph.")

    try:
        start_uuid = UUID(str(start_node_id))
        destination_uuid = UUID(str(destination_node_id))
    except (ValueError, TypeError, AttributeError) as exc:
        raise RouteNodeNotFoundError("Start or destination node ID is invalid.") from exc

    start = str(start_uuid)
    destination = str(destination_uuid)
    if start not in graph:
        raise RouteNodeNotFoundError("Start node was not found in this campus.")
    if destination not in graph:
        raise RouteNodeNotFoundError("Destination node was not found in this campus.")

    try:
        path = nx.astar_path(
            graph,
            source=start,
            target=destination,
            heuristic=zero_heuristic,
            weight=_networkx_distance_weight,
        )
    except nx.NetworkXNoPath as exc:
        raise NoRouteFoundError("No route connects the requested nodes.") from exc

    steps: list[RouteStep] = []
    for from_node, to_node in zip(path, path[1:]):
        parallel_edges = graph.get_edge_data(from_node, to_node)
        if not parallel_edges:
            raise InvalidRouteGraphError("A* returned a path with a missing edge.")
        selected_key, selected_attributes = min(
            parallel_edges.items(),
            key=lambda item: (
                _minimum_parallel_distance({item[0]: item[1]}),
                str(item[1].get("id", item[0])),
            ),
        )
        edge_id_value = selected_attributes.get("id")
        try:
            edge_id = UUID(str(edge_id_value))
        except (ValueError, TypeError, AttributeError) as exc:
            raise InvalidRouteGraphError("A traversable edge has an invalid ID.") from exc

        steps.append(
            RouteStep(
                from_node_id=UUID(from_node),
                to_node_id=UUID(to_node),
                edge_id=edge_id,
                distance_m=_minimum_parallel_distance(
                    {selected_key: selected_attributes}
                ),
            )
        )

    total_distance = math.fsum(step.distance_m for step in steps)
    return ShortestRouteResponse(
        campus_id=UUID(str(graph.graph["campus_id"])),
        start_node_id=start_uuid,
        destination_node_id=destination_uuid,
        path_node_ids=[UUID(node_id) for node_id in path],
        total_distance_m=total_distance,
        steps=steps,
    )


__all__ = ["calculate_astar_route", "zero_heuristic"]