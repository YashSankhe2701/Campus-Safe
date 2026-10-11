"""Tests for persisted-condition applicability and blockage-aware routing."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import UUID

import networkx as nx
import pytest

from app.database.emergency_repository import (
    EmergencyConditionDataError,
    compile_emergency_conditions,
)
from app.services.emergency_routing_service import calculate_emergency_aware_route
from app.services.routing_service import NoRouteFoundError

CAMPUS = UUID("10000000-0000-4000-8000-000000000001")
NODE_A = UUID("20000000-0000-4000-8000-000000000001")
NODE_B = UUID("20000000-0000-4000-8000-000000000002")
NODE_C = UUID("20000000-0000-4000-8000-000000000003")
NODE_D = UUID("20000000-0000-4000-8000-000000000004")
EDGE_AB = UUID("30000000-0000-4000-8000-000000000001")
EDGE_BD = UUID("30000000-0000-4000-8000-000000000002")
EDGE_AC = UUID("30000000-0000-4000-8000-000000000003")
EDGE_CD = UUID("30000000-0000-4000-8000-000000000004")
EDGE_PARALLEL = UUID("30000000-0000-4000-8000-000000000005")
EMERGENCY_A = UUID("60000000-0000-4000-8000-000000000001")
EMERGENCY_B = UUID("60000000-0000-4000-8000-000000000002")
NOW = datetime(2026, 10, 9, tzinfo=timezone.utc)


def make_graph():
    graph = nx.MultiDiGraph(campus_id=str(CAMPUS))
    graph.add_nodes_from(str(node_id) for node_id in (NODE_A, NODE_B, NODE_C, NODE_D))
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 1, bidirectional=True)
    add_edge(graph, EDGE_BD, NODE_B, NODE_D, 1, bidirectional=True)
    add_edge(graph, EDGE_AC, NODE_A, NODE_C, 3, bidirectional=True)
    add_edge(graph, EDGE_CD, NODE_C, NODE_D, 3, bidirectional=True)
    return graph


def add_edge(graph, edge_id, source, target, distance, *, bidirectional=False):
    attributes = {
        "id": str(edge_id),
        "distance": distance,
        "base_capacity": 10,
        "base_speed": 1.0,
        "bidirectional": bidirectional,
    }
    graph.add_edge(str(source), str(target), key=str(edge_id), **attributes)
    if bidirectional:
        graph.add_edge(str(target), str(source), key=str(edge_id), **attributes)


def condition_snapshot(*, blocked_nodes=(), blocked_edges=(), active_ids=()):
    from app.database.emergency_repository import EmergencyConditionSnapshot

    return EmergencyConditionSnapshot(
        active_emergency_ids=tuple(sorted(map(str, active_ids))),
        blocked_node_ids=tuple(sorted(map(str, blocked_nodes))),
        blocked_edge_ids=tuple(sorted(map(str, blocked_edges))),
    )


def test_no_conditions_returns_ordinary_distance_route():
    graph = make_graph()

    result = calculate_emergency_aware_route(
        graph,
        condition_snapshot(),
        NODE_A,
        NODE_D,
    )

    assert result.path_node_ids == [NODE_A, NODE_B, NODE_D]
    assert result.total_distance_m == 2


def test_blocked_shortest_edges_cause_a_valid_detour():
    graph = make_graph()

    result = calculate_emergency_aware_route(
        graph,
        condition_snapshot(blocked_edges=(EDGE_AB,)),
        NODE_A,
        NODE_D,
    )

    assert result.path_node_ids == [NODE_A, NODE_C, NODE_D]
    assert result.total_distance_m == 6
    assert EDGE_AB not in {step.edge_id for step in result.steps}


def test_all_paths_blocked_returns_no_route_without_fallback():
    graph = make_graph()

    with pytest.raises(NoRouteFoundError):
        calculate_emergency_aware_route(
            graph,
            condition_snapshot(blocked_edges=(EDGE_AB, EDGE_AC)),
            NODE_A,
            NODE_D,
        )


def test_blocked_node_is_not_traversable_including_as_endpoint():
    graph = make_graph()

    with pytest.raises(NoRouteFoundError, match="endpoint is blocked"):
        calculate_emergency_aware_route(
            graph,
            condition_snapshot(blocked_nodes=(NODE_A,)),
            NODE_A,
            NODE_D,
        )


def test_parallel_edge_blockage_keeps_other_edge_and_reports_its_id():
    graph = make_graph()
    add_edge(graph, EDGE_PARALLEL, NODE_A, NODE_B, 2, bidirectional=True)

    result = calculate_emergency_aware_route(
        graph,
        condition_snapshot(blocked_edges=(EDGE_AB,)),
        NODE_A,
        NODE_B,
    )

    assert result.total_distance_m == 2
    assert result.steps[0].edge_id == EDGE_PARALLEL


def test_one_way_edge_remains_directed():
    graph = nx.MultiDiGraph(campus_id=str(CAMPUS))
    graph.add_nodes_from((str(NODE_A), str(NODE_B)))
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 1)

    with pytest.raises(NoRouteFoundError):
        calculate_emergency_aware_route(
            graph,
            condition_snapshot(),
            NODE_B,
            NODE_A,
        )


def test_routing_does_not_mutate_original_graph():
    graph = make_graph()
    before = deepcopy(graph)

    calculate_emergency_aware_route(
        graph,
        condition_snapshot(blocked_edges=(EDGE_AB,)),
        NODE_A,
        NODE_D,
    )

    assert nx.utils.graphs_equal(graph, before)


def test_risk_scores_are_not_used_without_documented_semantics():
    graph = make_graph()
    affected_edges = [
        {
            "campus_id": CAMPUS,
            "emergency_id": EMERGENCY_A,
            "edge_id": EDGE_AB,
            "risk_score": 1,
            "blocked": False,
        }
    ]
    conditions = compile_emergency_conditions(
        str(CAMPUS),
        [
            {
                "id": EMERGENCY_A,
                "campus_id": CAMPUS,
                "status": "active",
                "started_at": NOW - timedelta(minutes=1),
                "ended_at": None,
            }
        ],
        [],
        affected_edges,
        [],
        [],
        now=NOW,
    )

    result = calculate_emergency_aware_route(graph, conditions, NODE_A, NODE_D)

    assert result.total_distance_m == 2
    assert conditions.blocked_edge_ids == ()


def test_only_started_active_emergencies_apply_and_blockage_is_or_precedence():
    emergencies = [
        {
            "id": EMERGENCY_A,
            "campus_id": CAMPUS,
            "status": "active",
            "started_at": NOW - timedelta(minutes=1),
            "ended_at": None,
        },
        {
            "id": EMERGENCY_B,
            "campus_id": CAMPUS,
            "status": "resolved",
            "started_at": NOW - timedelta(minutes=10),
            "ended_at": NOW - timedelta(minutes=2),
        },
        {
            "id": "60000000-0000-4000-8000-000000000003",
            "campus_id": CAMPUS,
            "status": "active",
            "started_at": NOW + timedelta(minutes=1),
            "ended_at": None,
        },
    ]
    conditions = compile_emergency_conditions(
        str(CAMPUS),
        emergencies,
        [
            {"campus_id": CAMPUS, "emergency_id": EMERGENCY_A, "node_id": NODE_C, "blocked": True},
            {"campus_id": CAMPUS, "emergency_id": EMERGENCY_B, "node_id": NODE_B, "blocked": True},
        ],
        [
            {"campus_id": CAMPUS, "emergency_id": EMERGENCY_A, "edge_id": EDGE_AB, "blocked": True},
            {"campus_id": CAMPUS, "emergency_id": EMERGENCY_B, "edge_id": EDGE_AC, "blocked": True},
        ],
        [],
        [],
        now=NOW,
    )

    assert conditions.active_emergency_ids == (str(EMERGENCY_A),)
    assert conditions.blocked_node_ids == (str(NODE_C),)
    assert conditions.blocked_edge_ids == (str(EDGE_AB),)


def test_null_emergency_conditions_apply_without_active_emergencies():
    old_timestamp = NOW - timedelta(days=365)
    conditions = compile_emergency_conditions(
        str(CAMPUS),
        [],
        [],
        [],
        [
            {
                "campus_id": CAMPUS,
                "emergency_id": None,
                "node_id": NODE_C,
                "blocked": True,
                "updated_at": old_timestamp,
            }
        ],
        [],
        now=NOW,
    )

    assert conditions.active_emergency_ids == ()
    assert conditions.blocked_node_ids == (str(NODE_C),)


def test_active_emergency_condition_and_current_condition_both_apply():
    conditions = compile_emergency_conditions(
        str(CAMPUS),
        [
            {
                "id": EMERGENCY_A,
                "campus_id": CAMPUS,
                "status": "active",
                "started_at": NOW - timedelta(minutes=1),
                "ended_at": None,
            }
        ],
        [],
        [
            {"campus_id": CAMPUS, "emergency_id": EMERGENCY_A, "edge_id": EDGE_AB, "blocked": True}
        ],
        [],
        [
            {"campus_id": CAMPUS, "emergency_id": None, "edge_id": EDGE_AC, "blocked": True}
        ],
        now=NOW,
    )

    assert conditions.blocked_edge_ids == tuple(sorted((str(EDGE_AB), str(EDGE_AC))))


def test_invalid_condition_entity_id_is_not_silently_ignored():
    with pytest.raises(EmergencyConditionDataError, match="different campus"):
        compile_emergency_conditions(
            str(CAMPUS),
            [],
            [],
            [],
            [{"campus_id": "ffffffff-ffff-4fff-8fff-ffffffffffff", "node_id": NODE_A, "blocked": True}],
            [],
            now=NOW,
        )