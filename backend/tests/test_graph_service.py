"""Unit tests for campus graph construction and validation."""

from uuid import UUID

import networkx as nx
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.main import app
from app.services.graph_service import CampusNotFoundError, GraphRepository, load_campus_graph
from app.services.graph_service import GraphDataError, build_campus_graph

CAMPUS_ID = UUID("10000000-0000-4000-8000-000000000001")
NODE_A = UUID("20000000-0000-4000-8000-000000000001")
NODE_B = UUID("20000000-0000-4000-8000-000000000002")
EDGE_ID = UUID("30000000-0000-4000-8000-000000000001")


def make_node(node_id=NODE_A, **overrides):
    row = {
        "id": node_id,
        "floor_id": None,
        "node_type": "junction",
        "name": "Node A",
        "code": "A",
        "x_coordinate": 1.0,
        "y_coordinate": 2.0,
        "latitude": None,
        "longitude": None,
        "capacity": 10,
        "is_exit": False,
        "is_assembly_point": False,
        "metadata": {},
    }
    row.update(overrides)
    return row


def make_edge(from_node=NODE_A, to_node=NODE_B, **overrides):
    row = {
        "id": EDGE_ID,
        "from_node_id": from_node,
        "to_node_id": to_node,
        "distance": 5.5,
        "base_capacity": 20,
        "base_speed": 1.2,
        "bidirectional": True,
        "edge_type": "hallway",
        "metadata": {"surface": "synthetic"},
    }
    row.update(overrides)
    return row


def build(nodes=None, edges=None):
    return build_campus_graph(
        str(CAMPUS_ID),
        {"id": CAMPUS_ID, "name": "Demo Campus"},
        nodes if nodes is not None else [make_node(), make_node(NODE_B)],
        edges if edges is not None else [make_edge()],
    )


def test_builds_multidigraph_with_node_and_edge_metadata():
    graph = build()

    assert isinstance(graph, nx.MultiDiGraph)
    assert graph.number_of_nodes() == 2
    assert graph.number_of_edges() == 2
    assert graph.nodes[str(NODE_A)]["node_type"] == "junction"
    assert graph.nodes[str(NODE_A)]["x_coordinate"] == 1.0
    forward = graph[str(NODE_A)][str(NODE_B)][str(EDGE_ID)]
    reverse = graph[str(NODE_B)][str(NODE_A)][str(EDGE_ID)]
    assert forward["metadata"] == {"surface": "synthetic"}
    assert forward["distance"] == 5.5
    assert forward["traversal_direction"] == "forward"
    assert reverse["traversal_direction"] == "reverse"
    assert graph.graph["stored_edge_count"] == 1
    assert graph.graph["bidirectional_edge_count"] == 1
    assert graph.graph["arc_count"] == 2


def test_one_way_edge_is_not_reversed():
    graph = build(edges=[make_edge(bidirectional=False)])

    assert graph.has_edge(str(NODE_A), str(NODE_B))
    assert not graph.has_edge(str(NODE_B), str(NODE_A))
    assert graph.graph["directed_edge_count"] == 1
    assert graph.graph["arc_count"] == 1


def test_invalid_node_id_is_rejected():
    with pytest.raises(GraphDataError, match="Invalid UUID"):
        build(nodes=[make_node("not-a-uuid")], edges=[])


def test_invalid_edge_reference_is_rejected():
    with pytest.raises(GraphDataError, match="references a node"):
        build(edges=[make_edge(to_node=UUID("ffffffff-ffff-4fff-8fff-ffffffffffff"))])


@pytest.mark.parametrize("distance", [0, -1, float("inf"), float("nan"), "5"])
def test_invalid_distance_is_rejected(distance):
    with pytest.raises(GraphDataError, match="distance"):
        build(edges=[make_edge(distance=distance)])


def test_invalid_capacity_is_rejected():
    with pytest.raises(GraphDataError, match="base_capacity"):
        build(edges=[make_edge(base_capacity=0)])


def test_self_loop_is_rejected():
    with pytest.raises(GraphDataError, match="self-loops"):
        build(edges=[make_edge(to_node=NODE_A)])


@pytest.mark.anyio
async def test_loads_seeded_demo_graph_from_postgres():
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    graph = await load_campus_graph(str(CAMPUS_ID))

    assert isinstance(graph, nx.MultiDiGraph)
    assert graph.number_of_nodes() == 21
    assert graph.graph["stored_edge_count"] == 21
    assert graph.graph["bidirectional_edge_count"] > 0
    assert graph.graph["directed_edge_count"] > 0
    assert graph.graph["arc_count"] == graph.number_of_edges()
    assert sum(data["is_exit"] for _, data in graph.nodes(data=True)) == 3
    assert sum(data["is_assembly_point"] for _, data in graph.nodes(data=True)) == 1
    assert graph.nodes[str(NODE_A)]["floor_id"] is not None
    assert graph[str(NODE_A)][str(NODE_B)][str(EDGE_ID)]["metadata"]["synthetic"] is True


@pytest.mark.anyio
async def test_graph_endpoint_returns_metadata_for_demo_campus():
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/api/campuses/{CAMPUS_ID}/graph")

    assert response.status_code == 200
    data = response.json()
    assert data["campus_id"] == str(CAMPUS_ID)
    assert data["graph_type"] == "MultiDiGraph"
    assert data["node_count"] == 21
    assert data["edge_count"] == 21
    assert data["exit_count"] == 3
    assert data["assembly_point_count"] == 1
    assert "graph" not in data


@pytest.mark.anyio
async def test_graph_endpoint_returns_404_for_unknown_campus():
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    unknown_id = "ffffffff-ffff-4fff-8fff-ffffffffffff"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/api/campuses/{unknown_id}/graph")

    assert response.status_code == 404