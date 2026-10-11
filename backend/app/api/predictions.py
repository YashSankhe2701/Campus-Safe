"""Synthetic-trained per-route travel-time prediction endpoint."""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.database.emergency_repository import EmergencyConditionDataError
from app.schemas.prediction import RouteTimePredictionRequest, RouteTimePredictionResponse
from app.services.evacuation_prediction import (
    DEFAULT_MODEL_PATH,
    PredictionArtifactError,
)
from app.services.graph_service import CampusNotFoundError, GraphDataError
from app.services.route_prediction_service import (
    RoutePredictionBlockedError,
    RoutePredictionInputError,
    predict_campus_route_time,
)

logger = logging.getLogger("campus_safe")
router = APIRouter(prefix="/api/campuses", tags=["predictions"])


@router.post(
    "/{campus_id}/routes/predicted-time",
    response_model=RouteTimePredictionResponse,
)
async def predict_route_time(
    campus_id: UUID,
    request: RouteTimePredictionRequest,
) -> RouteTimePredictionResponse:
    """Predict scenario travel time on a currently traversable supplied route."""
    try:
        return await predict_campus_route_time(
            str(campus_id),
            request,
            artifact_path=DEFAULT_MODEL_PATH,
        )
    except CampusNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Campus not found.") from exc
    except RoutePredictionBlockedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RoutePredictionInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PredictionArtifactError as exc:
        logger.error("Synthetic route-time model artifact is unavailable or incompatible.")
        raise HTTPException(
            status_code=503,
            detail="Travel-time prediction model is unavailable.",
        ) from exc
    except (GraphDataError, EmergencyConditionDataError) as exc:
        logger.error("Invalid campus data for route prediction on %s: %s", campus_id, exc)
        raise HTTPException(
            status_code=500,
            detail="Stored campus routing data is invalid.",
        ) from exc
    except ConnectionError as exc:
        logger.error("Route prediction database connection is unavailable.")
        raise HTTPException(
            status_code=503,
            detail="Campus routing database is unavailable.",
        ) from exc