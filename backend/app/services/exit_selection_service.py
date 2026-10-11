"""Fresh, blockage-aware campus exit evaluation and selection."""

import asyncio
from typing import Any, Protocol
from uuid import UUID

import networkx as nx

from app.database.emergency_repository import (
    EmergencyConditionDataError,
    EmergencyConditionSnapshot,
    PostgresEmergencyConditionRepository,
)
from app.database.exit_repository import ExitDataError, PostgresExitRepository
from app.schemas.exit_selection import EvaluatedExit, ExitSelectionResponse
from app.services.emergency_routing_service import calculate_emergency_aware_route
from app.services.graph_service import load_campus_graph
from app.services.routing_service import NoRouteFoundError, RouteNodeNotFoundError


class ExitRepository(Protocol):
    def load_exits(self, campus_id: str) -> list[dict[str, Any]]: ...


class ConditionsRepository(Protocol):
    def load_conditions(self, campus_id: str) -> EmergencyConditionSnapshot: ...


def _exit_uuid(value: Any, field: str) -> UUID:
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ExitDataError(f"Invalid UUID in exits.{field}.") from exc


def select_campus_exit(
    graph: nx.MultiDiGraph,
    conditions: EmergencyConditionSnapshot,
    start_node_id: UUID | str,
    exits: list[dict[str, Any]],
) -> ExitSelectionResponse:
    """Evaluate exits, then choose the lowest-distance reachable active exit."""
    campus_id = _exit_uuid(graph.graph.get("campus_id"), "campus_id")
    start_id = _exit_uuid(start_node_id, "start_node_id")
    start = str(start_id)
    if start not in graph:
        raise RouteNodeNotFoundError("Start node was not found in this campus.")

    blocked_nodes = set(conditions.blocked_node_ids)
    if start in blocked_nodes:
        raise NoRouteFoundError("No route exists because the start node is blocked.")

    evaluated: list[EvaluatedExit] = []
    eligible_routes: list[tuple[str, EvaluatedExit, Any]] = []
    seen_exit_ids: set[UUID] = set()
    for row in exits:
        exit_id = _exit_uuid(row.get("id"), "id")
        node_id = _exit_uuid(row.get("node_id"), "node_id")
        if exit_id in seen_exit_ids:
            raise ExitDataError("Duplicate exit ID in campus records.")
        seen_exit_ids.add(exit_id)
        if str(node_id) not in graph:
            raise ExitDataError("Exit references a node outside the loaded campus graph.")
        name = row.get("name")
        exit_type = row.get("exit_type")
        is_active = row.get("is_active")
        if not isinstance(name, str) or not name.strip() or not isinstance(exit_type, str):
            raise ExitDataError("Exit name or type is invalid.")
        if not isinstance(is_active, bool):
            raise ExitDataError("Exit is_active must be a boolean.")

        if not is_active:
            evaluated.append(
                EvaluatedExit(
                    exit_id=exit_id,
                    node_id=node_id,
                    name=name,
                    exit_type=exit_type,
                    reachable=False,
                    exclusion_reason="inactive",
                )
            )
            continue
        if str(node_id) in blocked_nodes:
            evaluated.append(
                EvaluatedExit(
                    exit_id=exit_id,
                    node_id=node_id,
                    name=name,
                    exit_type=exit_type,
                    reachable=False,
                    exclusion_reason="blocked",
                )
            )
            continue

        try:
            route = calculate_emergency_aware_route(
                graph,
                conditions,
                start_id,
                node_id,
            )
        except NoRouteFoundError:
            evaluated.append(
                EvaluatedExit(
                    exit_id=exit_id,
                    node_id=node_id,
                    name=name,
                    exit_type=exit_type,
                    reachable=False,
                    exclusion_reason="unreachable",
                )
            )
            continue

        result = EvaluatedExit(
            exit_id=exit_id,
            node_id=node_id,
            name=name,
            exit_type=exit_type,
            reachable=True,
            distance_m=route.total_distance_m,
        )
        evaluated.append(result)
        eligible_routes.append((str(exit_id), result, route))

    evaluated.sort(key=lambda result: str(result.exit_id))
    if not eligible_routes:
        return ExitSelectionResponse(
            status="no_route",
            campus_id=campus_id,
            start_node_id=start_id,
            selected_exit_id=None,
            selected_exit_node_id=None,
            selected_exit_name=None,
            selected_exit_type=None,
            path_node_ids=[],
            total_distance_m=None,
            steps=[],
            active_emergency_ids=[UUID(value) for value in conditions.active_emergency_ids],
            evaluated_exits=evaluated,
        )

    _, selected_exit, route = min(
        eligible_routes,
        key=lambda candidate: (candidate[1].distance_m, candidate[0]),
    )
    return ExitSelectionResponse(
        status="route_found",
        campus_id=campus_id,
        start_node_id=start_id,
        selected_exit_id=selected_exit.exit_id,
        selected_exit_node_id=selected_exit.node_id,
        selected_exit_name=selected_exit.name,
        selected_exit_type=selected_exit.exit_type,
        path_node_ids=route.path_node_ids,
        total_distance_m=route.total_distance_m,
        steps=route.steps,
        active_emergency_ids=[UUID(value) for value in conditions.active_emergency_ids],
        evaluated_exits=evaluated,
    )


async def load_campus_exit_selection(
    campus_id: str,
    start_node_id: UUID | str,
    *,
    exit_repository: ExitRepository | None = None,
    conditions_repository: ConditionsRepository | None = None,
) -> ExitSelectionResponse:
    """Load fresh graph, conditions, and exits for this invocation only."""
    graph = await load_campus_graph(campus_id)
    normalized_campus_id = str(UUID(campus_id))
    exits_repo = exit_repository or PostgresExitRepository()
    conditions_repo = conditions_repository or PostgresEmergencyConditionRepository()
    exits, conditions = await asyncio.gather(
        asyncio.to_thread(exits_repo.load_exits, normalized_campus_id),
        asyncio.to_thread(conditions_repo.load_conditions, normalized_campus_id),
    )
    return select_campus_exit(graph, conditions, start_node_id, exits)


__all__ = ["ExitDataError", "load_campus_exit_selection", "select_campus_exit"]