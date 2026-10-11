"""API-level tests for campus-scoped A* routing."""

from uuid import UUID

import networkx as nx
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.main import app
from app.services.graph_service import CampusNotFoundError

CAMPUS_ID = UUID("10000000-0000-4000-8000-000000000001")
NODE_A = "20000000-0000-4000-8000-000000000001"
NODE_B = "20000000-0000-4000-8000-000000000002"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as api_client:
        yield api_client


@pytest.mark.anyio
async def test_astar_request_validation_returns_422(client):
    response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/astar",
        json={"start_node_id": "", "destination_node_id": NODE_B},
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_astar_unknown_campus_returns_404(client, monkeypatch):
    async def missing_campus(campus_id):
        raise CampusNotFoundError(campus_id)

    monkeypatch.setattr("app.api.astar.load_campus_graph", missing_campus)
    response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/astar",
        json={"start_node_id": NODE_A, "destination_node_id": NODE_B},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Campus not found."


@pytest.mark.anyio
async def test_astar_unknown_node_returns_404(client):
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/astar",
        json={
            "start_node_id": "ffffffff-ffff-4fff-8fff-ffffffffffff",
            "destination_node_id": NODE_B,
        },
    )

    assert response.status_code == 404
    assert "Start node" in response.json()["detail"]


@pytest.mark.anyio
async def test_astar_unreachable_destination_returns_404(client, monkeypatch):
    graph = nx.MultiDiGraph(campus_id=str(CAMPUS_ID))
    graph.add_nodes_from((NODE_A, NODE_B))

    async def disconnected_graph(campus_id):
        return graph

    monkeypatch.setattr("app.api.astar.load_campus_graph", disconnected_graph)
    response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/astar",
        json={"start_node_id": NODE_A, "destination_node_id": NODE_B},
    )

    assert response.status_code == 404
    assert "No route" in response.json()["detail"]


@pytest.mark.anyio
async def test_live_astar_matches_dijkstra_distance(client):
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    payload = {"start_node_id": NODE_A, "destination_node_id": NODE_B}
    astar_response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/astar", json=payload
    )
    dijkstra_response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/shortest", json=payload
    )

    assert astar_response.status_code == 200
    assert dijkstra_response.status_code == 200
    astar_route = astar_response.json()
    dijkstra_route = dijkstra_response.json()
    assert astar_route["campus_id"] == str(CAMPUS_ID)
    assert astar_route["total_distance_m"] == dijkstra_route["total_distance_m"]
    assert astar_route["total_distance_m"] == sum(
        step["distance_m"] for step in astar_route["steps"]
    )