"""API tests for explicit-scenario congestion routing."""

from uuid import UUID
from datetime import datetime as RealDateTime, timezone

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
NODE_C = "20000000-0000-4000-8000-000000000003"
NODE_D = "20000000-0000-4000-8000-000000000004"
EDGE_AB = "30000000-0000-4000-8000-000000000001"
EDGE_BD = "30000000-0000-4000-8000-000000000002"
EDGE_AC = "30000000-0000-4000-8000-000000000003"
EDGE_CD = "30000000-0000-4000-8000-000000000004"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as api_client:
        yield api_client


class EmptyConditions:
    def load_conditions(self, campus_id):
        return EmergencyConditionSnapshot((), (), ())


def graph_fixture():
    graph = nx.MultiDiGraph(campus_id=str(CAMPUS))
    graph.add_nodes_from((NODE_A, NODE_B, NODE_C, NODE_D))
    edges = (
        (EDGE_AB, NODE_A, NODE_B, 5),
        (EDGE_BD, NODE_B, NODE_D, 5),
        (EDGE_AC, NODE_A, NODE_C, 7.5),
        (EDGE_CD, NODE_C, NODE_D, 7.5),
    )
    for edge_id, start, end, distance in edges:
        attrs = {
            "id": edge_id,
            "distance": distance,
            "base_capacity": 10,
            "base_speed": 1,
        }
        graph.add_edge(start, end, key=edge_id, **attrs)
        graph.add_edge(end, start, key=edge_id, **attrs)
    return graph


def patch_dependencies(monkeypatch):
    async def load_graph(campus_id):
        return graph_fixture()

    monkeypatch.setattr(
        "app.services.congestion_routing_service.load_campus_graph", load_graph
    )
    monkeypatch.setattr(
        "app.services.congestion_routing_service.PostgresEmergencyConditionRepository",
        EmptyConditions,
    )


@pytest.mark.anyio
async def test_invalid_scenario_capacity_returns_422(client):
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/congestion-scenario",
        json={
            "start_node_id": NODE_A,
            "destination_node_id": NODE_D,
            "base_walking_speed_mps": 1.2,
            "edge_scenarios": [
                {
                    "edge_id": EDGE_AB,
                    "occupancy_people": 2,
                    "capacity_people": 0,
                    "observed_at": "2026-10-09T12:00:00Z",
                }
            ],
        },
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_unknown_campus_returns_404(client, monkeypatch):
    async def missing_campus(campus_id):
        raise CampusNotFoundError(campus_id)

    monkeypatch.setattr(
        "app.services.congestion_routing_service.load_campus_graph", missing_campus
    )
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/congestion-scenario",
        json={
            "start_node_id": NODE_A,
            "destination_node_id": NODE_D,
            "base_walking_speed_mps": 1.2,
        },
    )

    assert response.status_code == 404


@pytest.mark.anyio
async def test_scenario_request_selects_less_congested_detour(client, monkeypatch):
    patch_dependencies(monkeypatch)

    class FrozenDateTime(RealDateTime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 10, 9, 12, tzinfo=tz or timezone.utc)

    monkeypatch.setattr(
        "app.services.congestion_routing_service.datetime",
        FrozenDateTime,
    )
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/congestion-scenario",
        json={
            "start_node_id": NODE_A,
            "destination_node_id": NODE_D,
            "base_walking_speed_mps": 1,
            "edge_scenarios": [
                {
                    "edge_id": EDGE_AB,
                    "occupancy_people": 10,
                    "capacity_people": 10,
                    "observed_at": "2026-10-09T12:00:00Z",
                },
                {
                    "edge_id": EDGE_BD,
                    "occupancy_people": 10,
                    "capacity_people": 10,
                    "observed_at": "2026-10-09T12:00:00Z",
                },
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["path_node_ids"] == [NODE_A, NODE_C, NODE_D]
    assert body["total_distance_m"] == 15
    assert body["estimated_travel_time_s"] == 15
    assert body["live_crowd_measurements_used"] is False
    assert body["data_mode"] == "explicit_scenario_inputs"


@pytest.mark.anyio
async def test_live_endpoint_uses_no_fake_measurements(client):
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/congestion-scenario",
        json={
            "start_node_id": NODE_A,
            "destination_node_id": NODE_B,
            "base_walking_speed_mps": 1.2,
            "edge_scenarios": [],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total_distance_m"] == 8
    assert body["live_crowd_measurements_used"] is False
    assert body["steps"][0]["measurement_status"] == "missing"