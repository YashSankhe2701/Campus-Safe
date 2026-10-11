"""Deterministic unit tests for baseline Dijkstra routing."""

from copy import deepcopy
from uuid import UUID

import networkx as nx
import pytest

from app.services.routing_service import (
    NoRouteFoundError,
    RouteNodeNotFoundError,
    calculate_shortest_route,
)

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


def make_graph() -> nx.MultiDiGraph:
    graph = nx.MultiDiGraph(campus_id=str(CAMPUS))
    graph.add_nodes_from(str(node_id) for node_id in (NODE_A, NODE_B, NODE_C, NODE_D))
    return graph


def add_edge(graph, edge_id, source, target, distance, *, bidirectional=False):
    attributes = {
        "id": str(edge_id),
        "distance": distance,
        "base_capacity": 10,
        "base_speed": 1.0,
        "bidirectional": bidirectional,
        "edge_type": "hallway",
        "metadata": {},
    }
    graph.add_edge(str(source), str(target), key=str(edge_id), **attributes)
    if bidirectional:
        graph.add_edge(
            str(target),
            str(source),
            key=str(edge_id),
            **{**attributes, "traversal_direction": "reverse"},
        )


def test_finds_simple_shortest_route_and_exact_distance():
    graph = make_graph()
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 4, bidirectional=True)
    add_edge(graph, EDGE_BD, NODE_B, NODE_D, 6, bidirectional=True)

    result = calculate_shortest_route(graph, NODE_A, NODE_D)

    assert result.path_node_ids == [NODE_A, NODE_B, NODE_D]
    assert result.total_distance_m == 10
    assert [step.edge_id for step in result.steps] == [EDGE_AB, EDGE_BD]
    assert sum(step.distance_m for step in result.steps) == result.total_distance_m


def test_minimizes_distance_not_number_of_edges():
    graph = make_graph()
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 100, bidirectional=True)
    add_edge(graph, EDGE_BD, NODE_B, NODE_D, 100, bidirectional=True)
    add_edge(graph, EDGE_AC, NODE_A, NODE_C, 2, bidirectional=True)
    add_edge(graph, EDGE_CD, NODE_C, NODE_D, 3, bidirectional=True)
    add_edge(graph, EDGE_PARALLEL, NODE_A, NODE_D, 10, bidirectional=True)

    result = calculate_shortest_route(graph, NODE_A, NODE_D)

    assert result.path_node_ids == [NODE_A, NODE_C, NODE_D]
    assert result.total_distance_m == 5


def test_disconnected_graph_raises_no_route():
    graph = make_graph()
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 1)

    with pytest.raises(NoRouteFoundError, match="No route"):
        calculate_shortest_route(graph, NODE_A, NODE_D)


@pytest.mark.parametrize(
    ("start", "destination", "message"),
    [
        (UUID("ffffffff-ffff-4fff-8fff-ffffffffffff"), NODE_D, "Start node"),
        (NODE_A, UUID("ffffffff-ffff-4fff-8fff-ffffffffffff"), "Destination node"),
    ],
)
def test_unknown_start_or_destination_raises(start, destination, message):
    with pytest.raises(RouteNodeNotFoundError, match=message):
        calculate_shortest_route(make_graph(), start, destination)


def test_one_way_edge_cannot_be_traversed_backwards():
    graph = make_graph()
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 1)

    with pytest.raises(NoRouteFoundError):
        calculate_shortest_route(graph, NODE_B, NODE_A)


def test_parallel_edges_select_and_report_the_lowest_distance_edge():
    graph = make_graph()
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 9, bidirectional=True)
    add_edge(graph, EDGE_PARALLEL, NODE_A, NODE_B, 2, bidirectional=True)

    result = calculate_shortest_route(graph, NODE_A, NODE_B)

    assert result.total_distance_m == 2
    assert result.steps[0].edge_id == EDGE_PARALLEL
    assert result.steps[0].distance_m == 2


def test_equal_parallel_edges_use_stable_edge_id_tiebreak():
    graph = make_graph()
    add_edge(graph, EDGE_PARALLEL, NODE_A, NODE_B, 2)
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 2)

    result = calculate_shortest_route(graph, NODE_A, NODE_B)

    assert result.steps[0].edge_id == min(EDGE_AB, EDGE_PARALLEL, key=str)


def test_routing_does_not_mutate_graph():
    graph = make_graph()
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 4, bidirectional=True)
    before = deepcopy(graph)

    calculate_shortest_route(graph, NODE_A, NODE_B)

    assert nx.utils.graphs_equal(graph, before)


def test_same_start_and_destination_returns_zero_distance_and_no_steps():
    graph = make_graph()

    result = calculate_shortest_route(graph, NODE_A, NODE_A)

    assert result.path_node_ids == [NODE_A]
    assert result.total_distance_m == 0
    assert result.steps == []