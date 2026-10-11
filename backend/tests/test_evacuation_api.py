"""API tests for distance-based campus exit selection."""

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
EXIT_ID = "40000000-0000-4000-8000-000000000001"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as api_client:
        yield api_client


class FakeRepository:
    def __init__(self, value):
        self.value = value

    def load_exits(self, campus_id):
        return self.value


class FakeConditions:
    def load_conditions(self, campus_id):
        return EmergencyConditionSnapshot((), (), ())


def graph():
    value = nx.MultiDiGraph(campus_id=str(CAMPUS))
    value.add_nodes_from((NODE_A, NODE_B))
    value.add_edge(
        NODE_A,
        NODE_B,
        key="30000000-0000-4000-8000-000000000001",
        id="30000000-0000-4000-8000-000000000001",
        distance=5,
        base_capacity=10,
        base_speed=1,
    )
    return value


def patch_loader(monkeypatch, exit_rows):
    async def load_graph(campus_id):
        return graph()

    monkeypatch.setattr(
        "app.services.exit_selection_service.load_campus_graph", load_graph
    )
    monkeypatch.setattr(
        "app.services.exit_selection_service.PostgresExitRepository",
        lambda: FakeRepository(exit_rows),
    )
    monkeypatch.setattr(
        "app.services.exit_selection_service.PostgresEmergencyConditionRepository",
        FakeConditions,
    )


@pytest.mark.anyio
async def test_invalid_request_returns_422(client):
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": ""},
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_unknown_campus_returns_404(client, monkeypatch):
    async def missing_campus(campus_id):
        raise CampusNotFoundError(campus_id)

    monkeypatch.setattr(
        "app.services.exit_selection_service.load_campus_graph", missing_campus
    )
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": NODE_A},
    )

    assert response.status_code == 404


@pytest.mark.anyio
async def test_unknown_start_node_returns_404(client, monkeypatch):
    patch_loader(
        monkeypatch,
        [{"id": EXIT_ID, "node_id": NODE_B, "name": "Exit", "exit_type": "emergency", "is_active": True}],
    )
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": "ffffffff-ffff-4fff-8fff-ffffffffffff"},
    )

    assert response.status_code == 404


@pytest.mark.anyio
async def test_no_eligible_exits_is_explicit_result(client, monkeypatch):
    patch_loader(monkeypatch, [])
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": NODE_A},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "no_route"
    assert response.json()["selected_exit_id"] is None


@pytest.mark.anyio
async def test_live_supabase_exit_selection(client):
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": NODE_A},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "route_found"
    assert body["selected_exit_id"]
    assert body["selected_exit_node_id"] == body["path_node_ids"][-1]
    assert body["total_distance_m"] == sum(
        step["distance_m"] for step in body["steps"]
    )
    assert "not a safety guarantee" in body["safety_notice"]