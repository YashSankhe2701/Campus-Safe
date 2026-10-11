"""Deterministic tests for A* routing with an admissible zero heuristic."""

from copy import deepcopy
from uuid import UUID

import networkx as nx
import pytest

from app.services.astar_service import calculate_astar_route, zero_heuristic
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
EDGE_DIRECT = UUID("30000000-0000-4000-8000-000000000005")


def make_graph() -> nx.MultiDiGraph:
    graph = nx.MultiDiGraph(campus_id=str(CAMPUS))
    graph.add_nodes_from(
        (
            str(node_id),
            {"x_coordinate": float(index * 1000), "y_coordinate": -float(index)},
        )
        for index, node_id in enumerate((NODE_A, NODE_B, NODE_C, NODE_D))
    )
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


def make_weighted_graph() -> nx.MultiDiGraph:
    graph = make_graph()
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 100, bidirectional=True)
    add_edge(graph, EDGE_BD, NODE_B, NODE_D, 100, bidirectional=True)
    add_edge(graph, EDGE_AC, NODE_A, NODE_C, 2, bidirectional=True)
    add_edge(graph, EDGE_CD, NODE_C, NODE_D, 3, bidirectional=True)
    add_edge(graph, EDGE_DIRECT, NODE_A, NODE_D, 10, bidirectional=True)
    return graph


def assert_path_valid(graph, result):
    assert len(result.path_node_ids) == len(result.steps) + 1
    for index, step in enumerate(result.steps):
        assert step.from_node_id == result.path_node_ids[index]
        assert step.to_node_id == result.path_node_ids[index + 1]
        assert graph.has_edge(
            str(step.from_node_id), str(step.to_node_id), key=str(step.edge_id)
        )


def test_astar_finds_simple_shortest_route_and_consistent_distance():
    graph = make_graph()
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 4, bidirectional=True)
    add_edge(graph, EDGE_BD, NODE_B, NODE_D, 6, bidirectional=True)

    result = calculate_astar_route(graph, NODE_A, NODE_D)

    assert result.path_node_ids == [NODE_A, NODE_B, NODE_D]
    assert result.total_distance_m == 10
    assert sum(step.distance_m for step in result.steps) == result.total_distance_m
    assert_path_valid(graph, result)


def test_astar_chooses_distance_over_fewer_hops():
    result = calculate_astar_route(make_weighted_graph(), NODE_A, NODE_D)

    assert result.path_node_ids == [NODE_A, NODE_C, NODE_D]
    assert result.total_distance_m == 5


def test_unreachable_destination_raises_no_route():
    graph = make_graph()
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 1)

    with pytest.raises(NoRouteFoundError, match="No route"):
        calculate_astar_route(graph, NODE_B, NODE_A)


@pytest.mark.parametrize(
    ("start", "destination", "message"),
    [
        (UUID("ffffffff-ffff-4fff-8fff-ffffffffffff"), NODE_D, "Start node"),
        (NODE_A, UUID("ffffffff-ffff-4fff-8fff-ffffffffffff"), "Destination node"),
    ],
)
def test_unknown_nodes_are_rejected(start, destination, message):
    with pytest.raises(RouteNodeNotFoundError, match=message):
        calculate_astar_route(make_graph(), start, destination)


def test_one_way_edges_cannot_be_traversed_backwards():
    graph = make_graph()
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 1)

    with pytest.raises(NoRouteFoundError):
        calculate_astar_route(graph, NODE_B, NODE_A)


def test_parallel_edges_report_the_cheapest_exact_edge():
    graph = make_graph()
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 9, bidirectional=True)
    add_edge(graph, EDGE_DIRECT, NODE_A, NODE_B, 2, bidirectional=True)

    result = calculate_astar_route(graph, NODE_A, NODE_B)

    assert result.total_distance_m == 2
    assert result.steps[0].edge_id == EDGE_DIRECT
    assert result.steps[0].distance_m == 2


def test_zero_heuristic_ignores_unscaled_coordinates():
    graph = make_graph()

    assert zero_heuristic(str(NODE_A), str(NODE_D)) == 0.0
    assert graph.nodes[str(NODE_A)]["x_coordinate"] != graph.nodes[str(NODE_D)]["x_coordinate"]


def test_astar_does_not_mutate_graph():
    graph = make_weighted_graph()
    before = deepcopy(graph)

    calculate_astar_route(graph, NODE_A, NODE_D)

    assert nx.utils.graphs_equal(graph, before)


@pytest.mark.parametrize(
    ("start", "destination"),
    [(NODE_A, NODE_D), (NODE_D, NODE_A), (NODE_A, NODE_C), (NODE_B, NODE_C)],
)
def test_astar_and_dijkstra_return_same_minimum_distance(start, destination):
    graph = make_weighted_graph()

    astar = calculate_astar_route(graph, start, destination)
    dijkstra = calculate_shortest_route(graph, start, destination)

    assert astar.total_distance_m == dijkstra.total_distance_m
    assert_path_valid(graph, astar)


def test_astar_and_dijkstra_both_report_unreachable_route():
    graph = make_graph()
    add_edge(graph, EDGE_AB, NODE_A, NODE_B, 1)

    with pytest.raises(NoRouteFoundError):
        calculate_astar_route(graph, NODE_B, NODE_A)
    with pytest.raises(NoRouteFoundError):
        calculate_shortest_route(graph, NODE_B, NODE_A)