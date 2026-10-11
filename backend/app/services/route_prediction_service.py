"""Predict one-person scenario travel time along a specified current route."""

import asyncio
from datetime import datetime
from pathlib import Path
from typing import Protocol
from uuid import UUID

import networkx as nx

from app.database.emergency_repository import (
    EmergencyConditionSnapshot,
    PostgresEmergencyConditionRepository,
)
from app.schemas.prediction import (
    EdgeMeasurementStatus,
    RouteTimePredictionRequest,
    RouteTimePredictionResponse,
)
from app.services.crowd_model import CrowdModelInputError
from app.services.evacuation_prediction import (
    DEFAULT_MODEL_PATH,
    PredictionArtifactError,
    predict_travel_time,
)
from app.services.graph_service import load_campus_graph
from app.services.prediction_features import (
    PredictionFeatureError,
    RouteScenarioSegment,
    extract_route_features,
)


class RoutePredictionInputError(ValueError):
    """Raised when the provided route or scenario does not match campus topology."""


class RoutePredictionBlockedError(ValueError):
    """Raised when the provided route now contains a Phase 3D blockage."""


class ConditionsRepository(Protocol):
    def load_conditions(self, campus_id: str) -> EmergencyConditionSnapshot: ...


def predict_specified_route(
    graph: nx.MultiDiGraph,
    conditions: EmergencyConditionSnapshot,
    request: RouteTimePredictionRequest,
    *,
    artifact_path: str | Path = DEFAULT_MODEL_PATH,
    now: datetime | None = None,
) -> RouteTimePredictionResponse:
    """Validate a supplied path against current topology/blockages, then predict."""
    path_nodes = [str(node_id) for node_id in request.path_node_ids]
    edge_ids = [str(edge_id) for edge_id in request.edge_ids]
    if any(node not in graph for node in path_nodes):
        raise RoutePredictionInputError("Route contains a node outside the requested campus.")

    blocked_nodes = set(conditions.blocked_node_ids)
    blocked_edges = set(conditions.blocked_edge_ids)
    if any(node in blocked_nodes for node in path_nodes):
        raise RoutePredictionBlockedError("Route contains a currently blocked node.")
    if any(edge_id in blocked_edges for edge_id in edge_ids):
        raise RoutePredictionBlockedError("Route contains a currently blocked edge.")

    scenario_by_edge = {str(sample.edge_id): sample for sample in request.edge_scenarios}
    if not set(scenario_by_edge) <= set(edge_ids):
        raise RoutePredictionInputError("Scenario samples may only refer to edges on the requested route.")
    traversable_edge_ids = {
        str(attributes.get("id"))
        for _, _, _, attributes in graph.edges(keys=True, data=True)
    }
    if not set(scenario_by_edge) <= traversable_edge_ids:
        raise RoutePredictionInputError("Scenario references an edge outside the requested campus.")

    segments: list[RouteScenarioSegment] = []
    for index, edge_id in enumerate(edge_ids):
        from_node = path_nodes[index]
        to_node = path_nodes[index + 1]
        if not graph.has_edge(from_node, to_node, key=edge_id):
            raise RoutePredictionInputError(
                "Route edge does not connect the corresponding consecutive nodes."
            )
        attributes = graph.get_edge_data(from_node, to_node, key=edge_id)
        if str(attributes.get("id")) != edge_id:
            raise RoutePredictionInputError("Route edge ID does not match stored topology.")
        sample = scenario_by_edge.get(edge_id)
        segments.append(
            RouteScenarioSegment(
                distance_m=attributes.get("distance"),
                occupancy_people=sample.occupancy_people if sample else None,
                capacity_people=sample.capacity_people if sample else None,
                observed_at=sample.observed_at if sample else None,
            )
        )

    try:
        extracted = extract_route_features(
            segments,
            request.base_walking_speed_mps,
            now=now,
        )
    except (CrowdModelInputError, PredictionFeatureError) as exc:
        raise RoutePredictionInputError(str(exc)) from exc

    prediction = predict_travel_time(extracted.features, artifact_path=artifact_path)
    statuses = [
        EdgeMeasurementStatus(
            edge_id=UUID(edge_id),
            measurement_status=metric.measurement_status,
            density_ratio=metric.density_ratio,
            congestion_score=metric.congestion_score,
        )
        for edge_id, metric in zip(edge_ids, extracted.segment_metrics, strict=True)
    ]
    return RouteTimePredictionResponse(
        predicted_travel_time_s=prediction.predicted_travel_time_s,
        route_distance_m=extracted.features["total_distance_m"],
        path_node_ids=request.path_node_ids,
        edge_ids=request.edge_ids,
        model_version=prediction.model_version,
        training_data_type="synthetic_phase4_formula_labels",
        input_data_mode="explicit_scenario_inputs",
        live_crowd_measurements_used=False,
        features=prediction.features,
        edge_measurement_statuses=statuses,
        validation_limitation=prediction.validation_limitation,
    )


async def predict_campus_route_time(
    campus_id: str,
    request: RouteTimePredictionRequest,
    *,
    conditions_repository: ConditionsRepository | None = None,
    artifact_path: str | Path = DEFAULT_MODEL_PATH,
    now: datetime | None = None,
) -> RouteTimePredictionResponse:
    """Load fresh campus graph/conditions, then predict without training or caching."""
    graph = await load_campus_graph(campus_id)
    repository = conditions_repository or PostgresEmergencyConditionRepository()
    conditions = await asyncio.to_thread(
        repository.load_conditions,
        str(UUID(campus_id)),
    )
    return predict_specified_route(
        graph,
        conditions,
        request,
        artifact_path=artifact_path,
        now=now,
    )


__all__ = [
    "RoutePredictionBlockedError",
    "RoutePredictionInputError",
    "predict_campus_route_time",
    "predict_specified_route",
]