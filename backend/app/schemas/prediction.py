"""API schemas for synthetic-trained route travel-time prediction."""

from math import isfinite
from typing import Dict, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.congestion import EdgeCrowdScenario


class RouteTimePredictionRequest(BaseModel):
    """A specified currently traversable route and optional scenario inputs."""

    path_node_ids: list[UUID] = Field(min_length=2)
    edge_ids: list[UUID] = Field(min_length=1)
    base_walking_speed_mps: float = Field(gt=0, allow_inf_nan=False)
    edge_scenarios: list[EdgeCrowdScenario] = Field(default_factory=list)

    @field_validator("base_walking_speed_mps")
    @classmethod
    def speed_is_finite(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("base_walking_speed_mps must be finite")
        return value

    @model_validator(mode="after")
    def edge_count_matches_path(self):
        if len(self.edge_ids) != len(self.path_node_ids) - 1:
            raise ValueError("edge_ids must contain one edge for each consecutive node pair")
        scenario_ids = [scenario.edge_id for scenario in self.edge_scenarios]
        if len(set(scenario_ids)) != len(scenario_ids):
            raise ValueError("edge_scenarios must not contain duplicate edge IDs")
        return self


class EdgeMeasurementStatus(BaseModel):
    edge_id: UUID
    measurement_status: Literal["valid", "missing", "missing_timestamp", "stale"]
    density_ratio: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    congestion_score: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)


class RouteTimePredictionResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    predicted_travel_time_s: float = Field(ge=0, allow_inf_nan=False)
    route_distance_m: float = Field(gt=0, allow_inf_nan=False)
    path_node_ids: list[UUID]
    edge_ids: list[UUID]
    model_version: str
    training_data_type: Literal["synthetic_phase4_formula_labels"]
    input_data_mode: Literal["explicit_scenario_inputs"]
    live_crowd_measurements_used: Literal[False] = False
    features: Dict[str, float]
    edge_measurement_statuses: list[EdgeMeasurementStatus]
    validation_limitation: str