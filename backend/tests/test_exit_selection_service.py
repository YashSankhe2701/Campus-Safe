"""Tests for distance-based reachable exit selection."""

from copy import deepcopy
from uuid import UUID

import networkx as nx
import pytest

from app.database.emergency_repository import EmergencyConditionSnapshot
from app.services.exit_selection_service import select_campus_exit

CAMPUS = UUID("10000000-0000-4000-8000-000000000001")
NODE_START = UUID("20000000-0000-4000-8000-000000000001")
NODE_NEAR = UUID("20000000-0000-4000-8000-000000000002")
NODE_FAR = UUID("20000000-0000-4000-8000-000000000003")
NODE_ISOLATED = UUID("20000000-0000-4000-8000-000000000004")
EDGE_NEAR = UUID("30000000-0000-4000-8000-000000000001")
EDGE_FAR = UUID("30000000-0000-4000-8000-000000000002")
EDGE_PARALLEL = UUID("30000000-0000-4000-8000-000000000003")
EXIT_A = UUID("40000000-0000-4000-8000-000000000001")
EXIT_B = UUID("40000000-0000-4000-8000-000000000002")
EXIT_C = UUID("40000000-0000-4000-8000-000000000003")
EXIT_INACTIVE = UUID("40000000-0000-4000-8000-000000000004")


def graph_fixture():
    graph = nx.MultiDiGraph(campus_id=str(CAMPUS))
    graph.add_nodes_from(
        str(node_id)
        for node_id in (NODE_START, NODE_NEAR, NODE_FAR, NODE_ISOLATED)
    )
    add_edge(graph, EDGE_NEAR, NODE_START, NODE_NEAR, 2)
    add_edge(graph, EDGE_FAR, NODE_START, NODE_FAR, 5)
    return graph


def add_edge(graph, edge_id, start, end, distance, *, bidirectional=False):
    attributes = {
        "id": str(edge_id),
        "distance": distance,
        "base_capacity": 10,
        "base_speed": 1.0,
        "bidirectional": bidirectional,
    }
    graph.add_edge(str(start), str(end), key=str(edge_id), **attributes)
    if bidirectional:
        graph.add_edge(str(end), str(start), key=str(edge_id), **attributes)


def exit_row(exit_id, node_id, *, active=True, name=None):
    return {
        "id": exit_id,
        "node_id": node_id,
        "name": name or f"Exit {str(exit_id)[-2:]}",
        "exit_type": "emergency",
        "is_active": active,
    }


def snapshot(*, blocked_nodes=(), blocked_edges=(), emergency_ids=()):
    return EmergencyConditionSnapshot(
        tuple(sorted(map(str, emergency_ids))),
        tuple(sorted(map(str, blocked_nodes))),
        tuple(sorted(map(str, blocked_edges))),
    )


def test_selects_nearest_reachable_active_exit():
    result = select_campus_exit(
        graph_fixture(),
        snapshot(),
        NODE_START,
        [exit_row(EXIT_A, NODE_FAR), exit_row(EXIT_B, NODE_NEAR)],
    )

    assert result.status == "route_found"
    assert result.selected_exit_id == EXIT_B
    assert result.selected_exit_node_id == NODE_NEAR
    assert result.total_distance_m == 2
    assert result.steps[0].edge_id == EDGE_NEAR


def test_closer_exit_is_excluded_when_its_node_is_blocked():
    result = select_campus_exit(
        graph_fixture(),
        snapshot(blocked_nodes=(NODE_NEAR,)),
        NODE_START,
        [exit_row(EXIT_A, NODE_FAR), exit_row(EXIT_B, NODE_NEAR)],
    )

    assert result.selected_exit_id == EXIT_A
    near_exit = next(exit_result for exit_result in result.evaluated_exits if exit_result.exit_id == EXIT_B)
    assert near_exit.exclusion_reason == "blocked"


def test_closer_exit_is_excluded_when_unreachable():
    result = select_campus_exit(
        graph_fixture(),
        snapshot(),
        NODE_START,
        [exit_row(EXIT_A, NODE_FAR), exit_row(EXIT_B, NODE_ISOLATED)],
    )

    assert result.selected_exit_id == EXIT_A
    unreachable = next(exit_result for exit_result in result.evaluated_exits if exit_result.exit_id == EXIT_B)
    assert unreachable.exclusion_reason == "unreachable"


def test_equal_distance_tie_is_broken_by_exit_uuid():
    graph = graph_fixture()
    add_edge(graph, EDGE_PARALLEL, NODE_START, NODE_FAR, 2)

    result = select_campus_exit(
        graph,
        snapshot(),
        NODE_START,
        [exit_row(EXIT_A, NODE_FAR), exit_row(EXIT_B, NODE_NEAR)],
    )

    assert result.total_distance_m == 2
    assert result.selected_exit_id == min(EXIT_A, EXIT_B, key=str)


@pytest.mark.parametrize(
    "exits",
    [[], [exit_row(EXIT_INACTIVE, NODE_NEAR, active=False)]],
)
def test_no_eligible_exits_returns_explicit_no_route(exits):
    result = select_campus_exit(
        graph_fixture(), snapshot(), NODE_START, exits
    )

    assert result.status == "no_route"
    assert result.selected_exit_id is None
    assert result.path_node_ids == []
    assert result.total_distance_m is None


def test_blocked_one_parallel_edge_can_select_an_alternate_parallel_exit_arc():
    graph = graph_fixture()
    add_edge(graph, EDGE_PARALLEL, NODE_START, NODE_NEAR, 4)

    result = select_campus_exit(
        graph,
        snapshot(blocked_edges=(EDGE_NEAR,)),
        NODE_START,
        [exit_row(EXIT_B, NODE_NEAR)],
    )

    assert result.total_distance_m == 4
    assert result.steps[0].edge_id == EDGE_PARALLEL


def test_selected_distance_matches_steps_and_graph_is_unchanged():
    graph = graph_fixture()
    before = deepcopy(graph)

    result = select_campus_exit(
        graph,
        snapshot(blocked_edges=(EDGE_NEAR,)),
        NODE_START,
        [exit_row(EXIT_A, NODE_FAR)],
    )

    assert result.total_distance_m == sum(step.distance_m for step in result.steps)
    assert nx.utils.graphs_equal(graph, before)


@pytest.mark.anyio
async def test_each_selection_invocation_loads_fresh_conditions(monkeypatch):
    from app.services import exit_selection_service

    graph = graph_fixture()
    conditions_seen = []
    graph_loads = []

    async def load_graph(campus_id):
        graph_loads.append(campus_id)
        return graph

    class ChangingConditions:
        def __init__(self):
            self.calls = 0

        def load_conditions(self, campus_id):
            self.calls += 1
            if self.calls == 1:
                return snapshot()
            return snapshot(blocked_nodes=(NODE_NEAR,))

    class Exits:
        def load_exits(self, campus_id):
            return [exit_row(EXIT_A, NODE_FAR), exit_row(EXIT_B, NODE_NEAR)]

    conditions = ChangingConditions()
    monkeypatch.setattr(exit_selection_service, "load_campus_graph", load_graph)

    first = await exit_selection_service.load_campus_exit_selection(
        str(CAMPUS), NODE_START, exit_repository=Exits(), conditions_repository=conditions
    )
    second = await exit_selection_service.load_campus_exit_selection(
        str(CAMPUS), NODE_START, exit_repository=Exits(), conditions_repository=conditions
    )

    assert conditions.calls == 2
    assert graph_loads == [str(CAMPUS), str(CAMPUS)]
    assert first.selected_exit_id == EXIT_B
    assert second.selected_exit_id == EXIT_A