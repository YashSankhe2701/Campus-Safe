"""API-level tests for campus-scoped shortest routing."""

from uuid import UUID

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
async def test_route_request_rejects_empty_or_invalid_ids(client):
    response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/shortest",
        json={"start_node_id": "", "destination_node_id": NODE_B},
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_unknown_campus_returns_404(client, monkeypatch):
    async def missing_campus(campus_id):
        raise CampusNotFoundError(campus_id)

    monkeypatch.setattr("app.api.routes.load_campus_graph", missing_campus)
    response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/shortest",
        json={"start_node_id": NODE_A, "destination_node_id": NODE_B},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Campus not found."


@pytest.mark.anyio
async def test_unknown_node_returns_404(client):
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/shortest",
        json={
            "start_node_id": "ffffffff-ffff-4fff-8fff-ffffffffffff",
            "destination_node_id": NODE_B,
        },
    )

    assert response.status_code == 404
    assert "Start node" in response.json()["detail"]


@pytest.mark.anyio
async def test_no_route_returns_404(client, monkeypatch):
    import networkx as nx

    from app.services.routing_service import NoRouteFoundError

    graph = nx.MultiDiGraph(campus_id=str(CAMPUS_ID))
    graph.add_nodes_from((NODE_A, NODE_B))

    async def disconnected_graph(campus_id):
        return graph

    monkeypatch.setattr("app.api.routes.load_campus_graph", disconnected_graph)
    response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/shortest",
        json={"start_node_id": NODE_A, "destination_node_id": NODE_B},
    )

    assert response.status_code == 404
    assert "No route" in response.json()["detail"]


@pytest.mark.anyio
async def test_live_demo_campus_route(client):
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/shortest",
        json={"start_node_id": NODE_A, "destination_node_id": NODE_B},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["campus_id"] == str(CAMPUS_ID)
    assert result["start_node_id"] == NODE_A
    assert result["destination_node_id"] == NODE_B
    assert result["path_node_ids"][0] == NODE_A
    assert result["path_node_ids"][-1] == NODE_B
    assert result["total_distance_m"] == sum(
        step["distance_m"] for step in result["steps"]
    )
    assert all(step["edge_id"] for step in result["steps"])


@pytest.mark.anyio
async def test_cross_building_route_adm_to_acd(client):
    """Confirm ADM-G-ENT can reach ACD-G-EXIT via Central Outdoor Walkway."""
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    adm_ent = "20000000-0000-4000-8000-000000000001"  # ADM-G-ENT
    acd_exit = "20000000-0000-4000-8000-000000000016"  # ACD-G-EXIT

    response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/shortest",
        json={"start_node_id": adm_ent, "destination_node_id": acd_exit},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["start_node_id"] == adm_ent
    assert result["destination_node_id"] == acd_exit
    assert result["total_distance_m"] == 78.0
    assert len(result["steps"]) == 8
    assert len(result["path_node_ids"]) == 9


@pytest.mark.anyio
async def test_reverse_cross_building_route_blocked_by_one_way_exit(client):
    """Confirm ACD-G-EXIT cannot traverse backwards into ADM-G-EXIT (one-way exit)."""
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    adm_ent = "20000000-0000-4000-8000-000000000001"  # ADM-G-ENT
    acd_exit = "20000000-0000-4000-8000-000000000016"  # ACD-G-EXIT

    response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/shortest",
        json={"start_node_id": acd_exit, "destination_node_id": adm_ent},
    )

    assert response.status_code == 404
    assert "No route" in response.json()["detail"]


@pytest.mark.anyio
async def test_route_acd_cor_to_adm_exit_unreachable_by_design(client):
    """Confirm ACD-G-COR cannot route to ADM-G-EXIT under Dijkstra or A*.

    Authoritative topology:
    - ADM-G-EXIT is an emergency egress door (is_exit=true).
    - Edge 10 (ADM-G-EXIT -> DEMO-WALKWAY) is strictly one-way (bidirectional=false).
    - Ingress into the Administration building from the central walkway is not permitted.
    - ADM-G-EXIT has in-degree 1, originating solely from within Administration (ADM-G-JCT).
    - Therefore, no directed path connects ACD-G-COR (or any Academic node) to ADM-G-EXIT.
    """
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")

    acd_cor = "20000000-0000-4000-8000-000000000012"  # ACD-G-COR
    adm_exit = "20000000-0000-4000-8000-000000000006"  # ADM-G-EXIT

    # Dijkstra (Shortest physical distance)
    dijkstra_response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/shortest",
        json={"start_node_id": acd_cor, "destination_node_id": adm_exit},
    )
    assert dijkstra_response.status_code == 404
    assert "No route connects the requested nodes." in dijkstra_response.json()["detail"]

    # A* routing
    astar_response = await client.post(
        f"/api/campuses/{CAMPUS_ID}/routes/astar",
        json={"start_node_id": acd_cor, "destination_node_id": adm_exit},
    )
    assert astar_response.status_code == 404
    assert "No route connects the requested nodes." in astar_response.json()["detail"]