"""Scenario-based congestion-aware route calculation."""

import asyncio
import math
from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import UUID

import networkx as nx

from app.database.emergency_repository import (
    EmergencyConditionSnapshot,
    PostgresEmergencyConditionRepository,
)
from app.schemas.congestion import (
    CongestionRouteRequest,
    CongestionRouteResponse,
    CongestionRouteStep,
)
from app.services.crowd_model import (
    CrowdMetrics,
    CrowdModelInputError,
    calculate_crowd_metrics,
    estimate_travel_time,
)
from app.services.emergency_routing_service import build_unblocked_graph
from app.services.graph_service import load_campus_graph
from app.services.routing_service import InvalidRouteGraphError, NoRouteFoundError, RouteNodeNotFoundError


class ConditionRepository(Protocol):
    def load_conditions(self, campus_id: str) -> EmergencyConditionSnapshot: ...


class CongestionScenarioError(ValueError):
    """Raised when explicit scenario data does not match the loaded graph."""


def _scenario_metrics_by_edge(
    graph: nx.MultiDiGraph,
    request: CongestionRouteRequest,
    *,
    now: datetime,
) -> dict[str, CrowdMetrics]:
    edge_ids = {
        str(attributes.get("id"))
        for _, _, _, attributes in graph.edges(keys=True, data=True)
    }
    metrics: dict[str, CrowdMetrics] = {}
    for scenario in request.edge_scenarios:
        edge_id = str(scenario.edge_id)
        if edge_id not in edge_ids:
            raise CongestionScenarioError("Scenario references an edge outside this campus graph.")
        if edge_id in metrics:
            raise CongestionScenarioError("Duplicate edge scenario supplied.")
        metrics[edge_id] = calculate_crowd_metrics(
            scenario.occupancy_people,
            scenario.capacity_people,
            observed_at=scenario.observed_at,
            now=now,
        )
    return metrics


def calculate_congestion_route(
    graph: nx.MultiDiGraph,
    conditions: EmergencyConditionSnapshot,
    request: CongestionRouteRequest,
    *,
    now: datetime | None = None,
) -> CongestionRouteResponse:
    """Minimize estimated seconds using explicit scenarios on an unblocked copy."""
    if not isinstance(graph, nx.MultiDiGraph) or not graph.is_directed():
        raise InvalidRouteGraphError("Campus graph must be a directed NetworkX MultiDiGraph.")

    start = str(request.start_node_id)
    destination = str(request.destination_node_id)
    if start not in graph:
        raise RouteNodeNotFoundError("Start node was not found in this campus.")
    if destination not in graph:
        raise RouteNodeNotFoundError("Destination node was not found in this campus.")

    current_time = now or datetime.now(timezone.utc)
    try:
        scenario_metrics = _scenario_metrics_by_edge(graph, request, now=current_time)
    except CrowdModelInputError as exc:
        raise CongestionScenarioError(str(exc)) from exc

    routing_graph = build_unblocked_graph(graph, conditions)
    if start not in routing_graph or destination not in routing_graph:
        raise NoRouteFoundError("No route exists because an endpoint is blocked.")

    for _, _, _, attributes in routing_graph.edges(keys=True, data=True):
        edge_id = str(attributes.get("id"))
        distance_m = attributes.get("distance")
        if (
            isinstance(distance_m, bool)
            or not isinstance(distance_m, (int, float))
            or not math.isfinite(distance_m)
            or distance_m <= 0
        ):
            raise InvalidRouteGraphError("Every traversable edge must have positive finite distance.")
        metrics = scenario_metrics.get(edge_id)
        if metrics is None:
            metrics = CrowdMetrics("missing", None, None, False)
        estimate = estimate_travel_time(
            float(distance_m),
            request.base_walking_speed_mps,
            metrics.congestion_score,
            metrics.measurement_status,
        )
        attributes["estimated_travel_time_s"] = estimate.estimated_time_s
        attributes["scenario_congestion_score"] = metrics.congestion_score
        attributes["scenario_density_ratio"] = metrics.density_ratio
        attributes["scenario_measurement_status"] = metrics.measurement_status
        attributes["scenario_over_capacity"] = metrics.over_capacity

    def travel_time_weight(
        _from_node: str,
        _to_node: str,
        parallel_edges: dict[Any, dict[str, Any]],
    ) -> float:
        times = [edge.get("estimated_travel_time_s") for edge in parallel_edges.values()]
        if not times or any(
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            or value < 0
            for value in times
        ):
            raise InvalidRouteGraphError("Every traversable edge must have a finite non-negative time.")
        return float(min(times))

    try:
        total_seconds, path = nx.single_source_dijkstra(
            routing_graph,
            source=start,
            target=destination,
            weight=travel_time_weight,
        )
    except nx.NetworkXNoPath as exc:
        raise NoRouteFoundError("No route connects the requested nodes.") from exc

    steps: list[CongestionRouteStep] = []
    for from_node, to_node in zip(path, path[1:]):
        parallel_edges = routing_graph.get_edge_data(from_node, to_node)
        if not parallel_edges:
            raise InvalidRouteGraphError("Congestion route contains a missing edge.")
        edge_key, selected = min(
            parallel_edges.items(),
            key=lambda item: (
                item[1]["estimated_travel_time_s"],
                str(item[1].get("id", item[0])),
            ),
        )
        try:
            edge_id = UUID(str(selected.get("id")))
        except (ValueError, TypeError, AttributeError) as exc:
            raise InvalidRouteGraphError("A traversable edge has an invalid ID.") from exc
        steps.append(
            CongestionRouteStep(
                from_node_id=UUID(from_node),
                to_node_id=UUID(to_node),
                edge_id=edge_id,
                distance_m=float(selected["distance"]),
                estimated_travel_time_s=float(selected["estimated_travel_time_s"]),
                density_ratio=selected["scenario_density_ratio"],
                congestion_score=selected["scenario_congestion_score"],
                measurement_status=selected["scenario_measurement_status"],
                over_capacity=selected["scenario_over_capacity"],
            )
        )

    distance_sum = math.fsum(step.distance_m for step in steps)
    time_sum = math.fsum(step.estimated_travel_time_s for step in steps)
    if not math.isclose(time_sum, total_seconds, rel_tol=1e-12, abs_tol=1e-12):
        raise InvalidRouteGraphError("Route time does not match selected edge details.")

    traversable_ids = {
        str(data.get("id"))
        for _, _, _, data in routing_graph.edges(keys=True, data=True)
    }
    valid_measurement_ids = {
        edge_id
        for edge_id, metrics in scenario_metrics.items()
        if metrics.measurement_status == "valid"
    }
    return CongestionRouteResponse(
        campus_id=UUID(str(graph.graph["campus_id"])),
        start_node_id=UUID(start),
        destination_node_id=UUID(destination),
        path_node_ids=[UUID(node) for node in path],
        total_distance_m=distance_sum,
        estimated_travel_time_s=time_sum,
        steps=steps,
        unknown_measurement_edge_count=len(traversable_ids - valid_measurement_ids),
    )


async def load_congestion_route(
    campus_id: str,
    request: CongestionRouteRequest,
    *,
    conditions_repository: ConditionRepository | None = None,
    now: datetime | None = None,
) -> CongestionRouteResponse:
    """Load fresh graph and emergency conditions for every scenario route call."""
    graph = await load_campus_graph(campus_id)
    repository = conditions_repository or PostgresEmergencyConditionRepository()
    conditions = await asyncio.to_thread(
        repository.load_conditions,
        str(UUID(campus_id)),
    )
    return calculate_congestion_route(graph, conditions, request, now=now)


__all__ = [
    "CongestionScenarioError",
    "calculate_congestion_route",
    "load_congestion_route",
]