"""API tests for synthetic-trained route-time prediction."""

from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.prediction import RouteTimePredictionResponse
from app.services.evacuation_prediction import PredictionArtifactError
from app.services.route_prediction_service import RoutePredictionBlockedError

CAMPUS = UUID("10000000-0000-4000-8000-000000000001")
NODE_A = "20000000-0000-4000-8000-000000000001"
NODE_B = "20000000-0000-4000-8000-000000000002"
EDGE_AB = "30000000-0000-4000-8000-000000000001"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as api_client:
        yield api_client


def payload():
    return {
        "path_node_ids": [NODE_A, NODE_B],
        "edge_ids": [EDGE_AB],
        "base_walking_speed_mps": 1.2,
        "edge_scenarios": [],
    }


@pytest.mark.anyio
async def test_invalid_path_contract_returns_422(client):
    body = payload()
    body["edge_ids"] = []
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/predicted-time", json=body
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_currently_blocked_route_returns_409(client, monkeypatch):
    async def blocked_route(campus_id, request, **kwargs):
        raise RoutePredictionBlockedError("Route contains a currently blocked edge.")

    monkeypatch.setattr("app.api.predictions.predict_campus_route_time", blocked_route)
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/predicted-time", json=payload()
    )

    assert response.status_code == 409


@pytest.mark.anyio
async def test_missing_model_artifact_returns_503(client, monkeypatch):
    async def unavailable(campus_id, request, **kwargs):
        raise PredictionArtifactError("artifact absent")

    monkeypatch.setattr("app.api.predictions.predict_campus_route_time", unavailable)
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/predicted-time", json=payload()
    )

    assert response.status_code == 503


@pytest.mark.anyio
async def test_success_response_identifies_synthetic_model_limitations(client, monkeypatch):
    async def prediction(campus_id, request, **kwargs):
        return RouteTimePredictionResponse(
            predicted_travel_time_s=5.0,
            route_distance_m=6.0,
            path_node_ids=request.path_node_ids,
            edge_ids=request.edge_ids,
            model_version="synthetic-route-time-rf-v1",
            training_data_type="synthetic_phase4_formula_labels",
            input_data_mode="explicit_scenario_inputs",
            features={"total_distance_m": 6.0},
            edge_measurement_statuses=[],
            validation_limitation="Not validated against real evacuation observations.",
        )

    monkeypatch.setattr("app.api.predictions.predict_campus_route_time", prediction)
    response = await client.post(
        f"/api/campuses/{CAMPUS}/routes/predicted-time", json=payload()
    )

    assert response.status_code == 200
    body = response.json()
    assert body["predicted_travel_time_s"] == 5
    assert body["training_data_type"] == "synthetic_phase4_formula_labels"
    assert body["live_crowd_measurements_used"] is False
    assert "Not validated" in body["validation_limitation"]