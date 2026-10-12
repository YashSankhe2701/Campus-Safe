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


@pytest.mark.anyio
async def test_live_exit_selection_from_academic_corridor_excludes_admin_exits_as_unreachable(client):
    """Confirm evacuation from ACD-G-COR selects Academic East Exit and excludes Admin exits as unreachable."""
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    acd_cor = "20000000-0000-4000-8000-000000000012"  # ACD-G-COR
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": acd_cor},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "route_found"
    assert body["selected_exit_name"] == "Academic East Emergency Exit"
    assert body["total_distance_m"] == 18.0

    evaluated = {e["name"]: e for e in body["evaluated_exits"]}
    assert evaluated["Academic East Emergency Exit"]["reachable"] is True
    assert evaluated["Academic East Emergency Exit"]["distance_m"] == 18.0
    assert evaluated["Administration West Emergency Exit"]["reachable"] is False
    assert evaluated["Administration West Emergency Exit"]["exclusion_reason"] == "unreachable"
    assert evaluated["Administration First Floor Fire Escape"]["reachable"] is False
    assert evaluated["Administration First Floor Fire Escape"]["exclusion_reason"] == "unreachable"


@pytest.mark.anyio
async def test_evacuation_api_dynamic_hazard_reroutes_and_excludes_blockage(client, monkeypatch):
    """Verify that passing blocked_edge_ids to the API reroutes to an alternate exit and records diagnostics."""
    node_c = "20000000-0000-4000-8000-000000000003"
    edge_1 = "30000000-0000-4000-8000-000000000001"
    edge_2 = "30000000-0000-4000-8000-000000000002"
    exit_1 = "40000000-0000-4000-8000-000000000001"
    exit_2 = "40000000-0000-4000-8000-000000000002"

    two_exit_graph = nx.MultiDiGraph(campus_id=str(CAMPUS))
    two_exit_graph.add_nodes_from((NODE_A, NODE_B, node_c))
    two_exit_graph.add_edge(NODE_A, NODE_B, key=edge_1, id=edge_1, distance=5.0, base_capacity=10, base_speed=1)
    two_exit_graph.add_edge(NODE_A, node_c, key=edge_2, id=edge_2, distance=12.0, base_capacity=10, base_speed=1)

    exit_rows = [
        {"id": exit_1, "node_id": NODE_B, "name": "Near Exit", "exit_type": "emergency", "is_active": True},
        {"id": exit_2, "node_id": node_c, "name": "Far Alternate Exit", "exit_type": "emergency", "is_active": True},
    ]

    async def load_graph(campus_id):
        return two_exit_graph

    monkeypatch.setattr("app.services.exit_selection_service.load_campus_graph", load_graph)
    monkeypatch.setattr("app.services.exit_selection_service.PostgresExitRepository", lambda: FakeRepository(exit_rows))
    monkeypatch.setattr("app.services.exit_selection_service.PostgresEmergencyConditionRepository", FakeConditions)

    # 1. Baseline request (no blockages) chooses Near Exit (5.0m)
    baseline_resp = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": NODE_A},
    )
    assert baseline_resp.status_code == 200
    baseline_body = baseline_resp.json()
    assert baseline_body["status"] == "route_found"
    assert baseline_body["selected_exit_id"] == exit_1
    assert baseline_body["total_distance_m"] == 5.0
    assert baseline_body["blocked_edge_count"] == 0

    # 2. Block edge_1 on original route -> dynamic reroute chooses Far Alternate Exit (12.0m)
    reroute_resp = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": NODE_A, "blocked_edge_ids": [edge_1]},
    )
    assert reroute_resp.status_code == 200
    reroute_body = reroute_resp.json()
    assert reroute_body["status"] == "route_found"
    assert reroute_body["selected_exit_id"] == exit_2
    assert reroute_body["total_distance_m"] == 12.0
    assert reroute_body["blocked_edge_count"] == 1
    assert all(step["edge_id"] != edge_1 for step in reroute_body["steps"])

    eval_map = {e["exit_id"]: e for e in reroute_body["evaluated_exits"]}
    assert eval_map[exit_1]["reachable"] is False
    assert eval_map[exit_1]["exclusion_reason"] == "blocked"
    assert eval_map[exit_2]["reachable"] is True
    assert eval_map[exit_2]["distance_m"] == 12.0

    # 3. Block both edge_1 and edge_2 -> structured no_route response
    noroute_resp = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": NODE_A, "blocked_edge_ids": [edge_1, edge_2]},
    )
    assert noroute_resp.status_code == 200
    noroute_body = noroute_resp.json()
    assert noroute_body["status"] == "no_route"
    assert noroute_body["selected_exit_id"] is None
    assert noroute_body["total_distance_m"] is None
    assert noroute_body["path_node_ids"] == []
    assert noroute_body["blocked_edge_count"] == 2

    # 4. Block start node -> HTTP 404
    start_blocked_resp = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": NODE_A, "blocked_node_ids": [NODE_A]},
    )
    assert start_blocked_resp.status_code == 404
    assert "start node is blocked" in start_blocked_resp.json()["detail"]


@pytest.mark.anyio
async def test_live_exit_selection_dynamic_hazard_reroutes_to_ground_exit(client):
    """Confirm live topology reroutes from 1st floor fire escape to ground exit when fire escape is blocked."""
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    adm_room = "20000000-0000-4000-8000-000000000008"  # ADM-1-ROOM
    fire_escape_edge = "30000000-0000-4000-8000-000000000009"  # ADM-1-COR -> ADM-1-EXIT (5m)
    ground_exit_edge = "30000000-0000-4000-8000-000000000005"  # ADM-G-JCT -> ADM-G-EXIT (4m)

    # Baseline: selects First Floor Fire Escape at 10.0m
    base_resp = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": adm_room},
    )
    assert base_resp.status_code == 200
    base_body = base_resp.json()
    assert base_body["status"] == "route_found"
    assert base_body["selected_exit_name"] == "Administration First Floor Fire Escape"
    assert base_body["total_distance_m"] == 10.0

    # With fire escape blocked: reroutes downstairs to Administration West Emergency Exit at 26.0m
    reroute_resp = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": adm_room, "blocked_edge_ids": [fire_escape_edge]},
    )
    assert reroute_resp.status_code == 200
    reroute_body = reroute_resp.json()
    assert reroute_body["status"] == "route_found"
    assert reroute_body["selected_exit_name"] == "Administration West Emergency Exit"
    assert reroute_body["total_distance_m"] == 26.0
    assert reroute_body["blocked_edge_count"] == 1
    assert fire_escape_edge not in [step["edge_id"] for step in reroute_body["steps"]]

    evaluated = {e["name"]: e for e in reroute_body["evaluated_exits"]}
    assert evaluated["Administration First Floor Fire Escape"]["reachable"] is False
    assert evaluated["Administration First Floor Fire Escape"]["exclusion_reason"] == "blocked"
    assert evaluated["Administration West Emergency Exit"]["reachable"] is True
    assert evaluated["Administration West Emergency Exit"]["distance_m"] == 26.0

    # With both fire escape and ground exit blocked: no reachable exit
    all_blocked_resp = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": adm_room, "blocked_edge_ids": [fire_escape_edge, ground_exit_edge]},
    )
    assert all_blocked_resp.status_code == 200
    all_blocked_body = all_blocked_resp.json()
    assert all_blocked_body["status"] == "no_route"
    assert all_blocked_body["selected_exit_id"] is None
    assert all_blocked_body["total_distance_m"] is None


@pytest.mark.anyio
async def test_live_exit_selection_adm_1_room_hazard_scenarios(client):
    """Regression test: verify all 4 hazard presets from ADM-1-ROOM with authoritative graph distances."""
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    adm_1_room = "20000000-0000-4000-8000-000000000009"  # ADM-1-ROOM
    fire_escape_edge = "30000000-0000-4000-8000-000000000009"  # ADM-1-COR -> ADM-1-EXIT (10m)
    ground_exit_edge = "30000000-0000-4000-8000-000000000005"  # ADM-G-JCT -> ADM-G-EXIT (12m)

    # 1. Baseline: nearest exit is 1st floor fire escape at 17.0m
    resp_baseline = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": adm_1_room, "blocked_edge_ids": []},
    )
    assert resp_baseline.status_code == 200
    body_base = resp_baseline.json()
    assert body_base["status"] == "route_found"
    assert body_base["selected_exit_name"] == "Administration First Floor Fire Escape"
    assert body_base["total_distance_m"] == 17.0
    assert body_base["blocked_edge_count"] == 0

    # 2. 1st Floor Fire Escape Blocked: reroutes downstairs to Administration West Emergency Exit at 33.0m
    resp_fire_blocked = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": adm_1_room, "blocked_edge_ids": [fire_escape_edge]},
    )
    assert resp_fire_blocked.status_code == 200
    body_fire = resp_fire_blocked.json()
    assert body_fire["status"] == "route_found"
    assert body_fire["selected_exit_name"] == "Administration West Emergency Exit"
    assert body_fire["total_distance_m"] == 33.0
    assert body_fire["blocked_edge_count"] == 1
    assert fire_escape_edge not in [s["edge_id"] for s in body_fire["steps"]]

    # Verify Administration First Floor Fire Escape is excluded as blocked and West Exit is selected
    eval_fire = {e["name"]: e for e in body_fire["evaluated_exits"]}
    assert eval_fire["Administration First Floor Fire Escape"]["reachable"] is False
    assert eval_fire["Administration First Floor Fire Escape"]["exclusion_reason"] == "blocked"
    assert eval_fire["Administration West Emergency Exit"]["reachable"] is True
    assert eval_fire["Administration West Emergency Exit"]["distance_m"] == 33.0

    # 3. West Ground Emergency Exit Blocked: fire escape remains open and selected at 17.0m
    resp_ground_blocked = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": adm_1_room, "blocked_edge_ids": [ground_exit_edge]},
    )
    assert resp_ground_blocked.status_code == 200
    body_ground = resp_ground_blocked.json()
    assert body_ground["status"] == "route_found"
    assert body_ground["selected_exit_name"] == "Administration First Floor Fire Escape"
    assert body_ground["total_distance_m"] == 17.0
    assert body_ground["blocked_edge_count"] == 1

    # 4. All Administration Exits Blocked: no reachable exit in the building yields no_route
    resp_all_blocked = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": adm_1_room, "blocked_edge_ids": [fire_escape_edge, ground_exit_edge]},
    )
    assert resp_all_blocked.status_code == 200
    body_all = resp_all_blocked.json()
    assert body_all["status"] == "no_route"
    assert body_all["selected_exit_id"] is None
    assert body_all["total_distance_m"] is None
    assert body_all["path_node_ids"] == []
    assert body_all["blocked_edge_count"] == 2

    # Verify both administration exits are explicitly marked blocked
    eval_all = {e["name"]: e for e in body_all["evaluated_exits"]}
    assert eval_all["Administration First Floor Fire Escape"]["reachable"] is False
    assert eval_all["Administration First Floor Fire Escape"]["exclusion_reason"] == "blocked"
    assert eval_all["Administration West Emergency Exit"]["reachable"] is False
    assert eval_all["Administration West Emergency Exit"]["exclusion_reason"] == "blocked"

    # 5. Return to Baseline: clears temporary blockages and restores baseline result (17.0m)
    resp_restored = await client.post(
        f"/api/campuses/{CAMPUS}/routes/evacuation",
        json={"start_node_id": adm_1_room, "blocked_edge_ids": []},
    )
    assert resp_restored.status_code == 200
    body_restored = resp_restored.json()
    assert body_restored["status"] == "route_found"
    assert body_restored["selected_exit_name"] == "Administration First Floor Fire Escape"
    assert body_restored["total_distance_m"] == 17.0
    assert body_restored["blocked_edge_count"] == 0
