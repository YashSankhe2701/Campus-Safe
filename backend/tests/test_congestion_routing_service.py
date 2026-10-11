"""Tests for scenario travel-time route selection."""

from copy import deepcopy
from datetime import datetime, timezone
from uuid import UUID

import networkx as nx
import pytest

from app.database.emergency_repository import EmergencyConditionSnapshot
from app.schemas.congestion import CongestionRouteRequest, EdgeCrowdScenario
from app.services.congestion_routing_service import (
    CongestionScenarioError,
    calculate_congestion_route,
)
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
NOW = datetime(2026, 10, 9, 12, tzinfo=timezone.utc)


def build_graph():
    graph = nx.MultiDiGraph(campus_id=str(CAMPUS))
    graph.add_nodes_from(str(node) for node in (NODE_A, NODE_B, NODE_C, NODE_D))
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 5, bidirectional=True)
    add_edge(graph, EDGE_BD, NODE_B, NODE_D, 5, bidirectional=True)
    add_edge(graph, EDGE_AC, NODE_A, NODE_C, 7.5, bidirectional=True)
    add_edge(graph, EDGE_CD, NODE_C, NODE_D, 7.5, bidirectional=True)
    return graph


def add_edge(graph, edge_id, from_node, to_node, distance, *, bidirectional=False):
    attributes = {
        "id": str(edge_id),
        "distance": distance,
        "base_capacity": 20,
        "base_speed": 0.8,
        "bidirectional": bidirectional,
    }
    graph.add_edge(str(from_node), str(to_node), key=str(edge_id), **attributes)
    if bidirectional:
        graph.add_edge(str(to_node), str(from_node), key=str(edge_id), **attributes)


def request(*samples):
    return CongestionRouteRequest(
        start_node_id=NODE_A,
        destination_node_id=NODE_D,
        base_walking_speed_mps=1,
        edge_scenarios=list(samples),
    )


def sample(edge_id, occupancy, capacity=10, observed_at=NOW):
    return EdgeCrowdScenario(
        edge_id=edge_id,
        occupancy_people=occupancy,
        capacity_people=capacity,
        observed_at=observed_at,
    )


def test_crowded_short_distance_route_loses_to_longer_time_route():
    graph = build_graph()
    result = calculate_congestion_route(
        graph,
        EmergencyConditionSnapshot((), (), ()),
        request(sample(EDGE_AB, 10), sample(EDGE_BD, 10)),
        now=NOW,
    )

    assert result.path_node_ids == [NODE_A, NODE_C, NODE_D]
    assert result.total_distance_m == 15
    assert result.estimated_travel_time_s == 15
    assert [step.measurement_status for step in result.steps] == ["missing", "missing"]
    assert result.live_crowd_measurements_used is False
    assert result.data_mode == "explicit_scenario_inputs"


def test_blocked_edges_are_removed_before_time_optimization():
    graph = build_graph()
    result = calculate_congestion_route(
        graph,
        EmergencyConditionSnapshot((), (), (str(EDGE_AC),)),
        request(),
        now=NOW,
    )

    assert result.path_node_ids == [NODE_A, NODE_B, NODE_D]
    assert EDGE_AC not in {step.edge_id for step in result.steps}


def test_all_paths_blocked_produces_no_route():
    graph = build_graph()

    with pytest.raises(NoRouteFoundError):
        calculate_congestion_route(
            graph,
            EmergencyConditionSnapshot((), (), (str(EDGE_AB), str(EDGE_AC))),
            request(),
            now=NOW,
        )


def test_parallel_edges_select_exact_lowest_time_edge():
    graph = nx.MultiDiGraph(campus_id=str(CAMPUS))
    graph.add_nodes_from((str(NODE_A), str(NODE_D)))
    add_edge(graph, EDGE_AB, NODE_A, NODE_D, 5)
    add_edge(graph, EDGE_PARALLEL, NODE_A, NODE_D, 7)

    result = calculate_congestion_route(
        graph,
        EmergencyConditionSnapshot((), (), ()),
        CongestionRouteRequest(
            start_node_id=NODE_A,
            destination_node_id=NODE_D,
            base_walking_speed_mps=1,
            edge_scenarios=[sample(EDGE_AB, 10)],
        ),
        now=NOW,
    )

    assert result.steps[0].edge_id == EDGE_PARALLEL
    assert result.total_distance_m == 7
    assert result.estimated_travel_time_s == 7


def test_exact_selected_edges_distance_and_time_are_consistent():
    graph = build_graph()
    result = calculate_congestion_route(
        graph,
        EmergencyConditionSnapshot((), (), ()),
        request(sample(EDGE_AB, 5), sample(EDGE_BD, 0)),
        now=NOW,
    )

    assert result.total_distance_m == sum(step.distance_m for step in result.steps)
    assert result.estimated_travel_time_s == sum(
        step.estimated_travel_time_s for step in result.steps
    )
    for index, step in enumerate(result.steps):
        assert step.from_node_id == result.path_node_ids[index]
        assert step.to_node_id == result.path_node_ids[index + 1]
        assert graph.has_edge(
            str(step.from_node_id), str(step.to_node_id), key=str(step.edge_id)
        )


def test_missing_and_stale_edge_samples_are_explicit():
    graph = build_graph()
    result = calculate_congestion_route(
        graph,
        EmergencyConditionSnapshot((), (), ()),
        request(sample(EDGE_AB, 10, observed_at=NOW.replace(year=2020))),
        now=NOW,
    )

    step_by_edge = {step.edge_id: step for step in result.steps}
    assert step_by_edge[EDGE_AB].measurement_status == "stale"
    assert step_by_edge[EDGE_AB].congestion_score is None
    assert step_by_edge[EDGE_BD].measurement_status == "missing"
    assert result.unknown_measurement_edge_count == 4


def test_unknown_or_duplicate_scenario_edges_are_rejected():
    graph = build_graph()
    unknown = UUID("3fffffff-ffff-4fff-8fff-ffffffffffff")
    with pytest.raises(CongestionScenarioError, match="outside"):
        calculate_congestion_route(
            graph,
            EmergencyConditionSnapshot((), (), ()),
            request(sample(unknown, 1)),
            now=NOW,
        )
    with pytest.raises(CongestionScenarioError, match="Duplicate"):
        calculate_congestion_route(
            graph,
            EmergencyConditionSnapshot((), (), ()),
            request(sample(EDGE_AB, 1), sample(EDGE_AB, 2)),
            now=NOW,
        )


def test_congestion_route_does_not_mutate_graph():
    graph = build_graph()
    before = deepcopy(graph)

    calculate_congestion_route(
        graph,
        EmergencyConditionSnapshot((), (), (str(EDGE_AB),)),
        request(sample(EDGE_BD, 10)),
        now=NOW,
    )

    assert nx.utils.graphs_equal(graph, before)