"""API tests for the initial blockage-aware routing endpoint."""

from uuid import UUID

import networkx as nx
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.database.emergency_repository import EmergencyConditionSnapshot
from app.main import app
from app.services.graph_service import CampusNotFoundError

CAMPUS = UUID("10000000-0000-4000-8000-000000000001")
NODE_A = "20000000-0000-4000-8000-000000000001"
NODE_B = "20000000-0000-4000-8000-000000000002"
EDGE_AB = "30000000-0000-4000-8000-000000000001"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as api_client:
        yield api_client


class FakeConditionRepository:
    def __init__(self, snapshot=None):
        self.snapshot = snapshot or EmergencyConditionSnapshot((), (), ())

    def load_conditions(self, campus_id):
        return self.snapshot


def connected_graph():
    graph = nx.MultiDiGraph(campus_id=str(CAMPUS))
    graph.add_nodes_from((NODE_A, NODE_B))
    graph.add_edge(
        NODE_A,
        NODE_B,
        key=EDGE_AB,
        id=EDGE_AB,
        distance=5.0,
        base_capacity=10,
        base_speed=1.0,
    )
    return graph


def patch_route_dependencies(monkeypatch, snapshot=None):
    graph = connected_graph()

    async def load_graph(campus_id):
        return graph

    monkeypatch.setattr(
        "app.services.emergency_routing_service.load_campus_graph",
        load_graph,
    )
    monkeypatch.setattr(
        "app.services.emergency_routing_service.PostgresEmergencyConditionRepository",
        lambda: FakeConditionRepository(snapshot),
    )
    return graph


@pytest.mark.anyio
async def test_request_validation_returns_422(client):
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/emergency-aware",
        json={"start_node_id": "", "destination_node_id": NODE_B},
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_unknown_campus_returns_404(client, monkeypatch):
    async def missing_campus(campus_id):
        raise CampusNotFoundError(campus_id)

    monkeypatch.setattr(
        "app.services.emergency_routing_service.load_campus_graph",
        missing_campus,
    )
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/emergency-aware",
        json={"start_node_id": NODE_A, "destination_node_id": NODE_B},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Campus not found."


@pytest.mark.anyio
async def test_unknown_node_returns_404(client, monkeypatch):
    patch_route_dependencies(monkeypatch)
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/emergency-aware",
        json={
            "start_node_id": "ffffffff-ffff-4fff-8fff-ffffffffffff",
            "destination_node_id": NODE_B,
        },
    )

    assert response.status_code == 404
    assert "Start node" in response.json()["detail"]


@pytest.mark.anyio
async def test_blocked_only_path_returns_404(client, monkeypatch):
    snapshot = EmergencyConditionSnapshot((), (), (EDGE_AB,))
    patch_route_dependencies(monkeypatch, snapshot)
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/emergency-aware",
        json={"start_node_id": NODE_A, "destination_node_id": NODE_B},
    )

    assert response.status_code == 404
    assert "No route" in response.json()["detail"]


@pytest.mark.anyio
async def test_success_returns_distance_and_explicit_risk_limitation(client, monkeypatch):
    patch_route_dependencies(
        monkeypatch,
        EmergencyConditionSnapshot(
            active_emergency_ids=(str(UUID("60000000-0000-4000-8000-000000000001")),),
            blocked_node_ids=(),
            blocked_edge_ids=(),
        ),
    )
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/emergency-aware",
        json={"start_node_id": NODE_A, "destination_node_id": NODE_B},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_distance_m"] == 5
    assert body["steps"][0]["edge_id"] == EDGE_AB
    assert body["active_emergency_ids"] == [
        "60000000-0000-4000-8000-000000000001"
    ]
    assert body["risk_weighting_applied"] is False
    assert body["risk_weighting_status"] == "unavailable_unvalidated_semantics"


@pytest.mark.anyio
async def test_live_demo_endpoint_does_not_modify_database(client):
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/emergency-aware",
        json={"start_node_id": NODE_A, "destination_node_id": NODE_B},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_distance_m"] == sum(
        step["distance_m"] for step in body["steps"]
    )
    assert body["risk_weighting_applied"] is False