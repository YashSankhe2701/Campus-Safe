"""Scenario-only congestion-aware routing endpoint."""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.congestion import CongestionRouteRequest, CongestionRouteResponse
from app.services.congestion_routing_service import (
    CongestionScenarioError,
    load_congestion_route,
)
from app.services.emergency_routing_service import EmergencyConditionDataError
from app.services.graph_service import CampusNotFoundError, GraphDataError
from app.services.routing_service import (
    InvalidRouteGraphError,
    NoRouteFoundError,
    RouteNodeNotFoundError,
)

logger = logging.getLogger("campus_safe")
router = APIRouter(prefix="/api/campuses", tags=["routes"])


@router.post(
    "/{campus_id}/routes/congestion-scenario",
    response_model=CongestionRouteResponse,
)
async def get_congestion_scenario_route(
    campus_id: UUID,
    request: CongestionRouteRequest,
) -> CongestionRouteResponse:
    """Calculate an explicitly scenario-based travel-time-minimizing route."""
    try:
        return await load_congestion_route(str(campus_id), request)
    except CampusNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Campus not found.") from exc
    except RouteNodeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NoRouteFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CongestionScenarioError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (GraphDataError, EmergencyConditionDataError, InvalidRouteGraphError) as exc:
        logger.error("Invalid campus topology or condition data for %s: %s", campus_id, exc)
        raise HTTPException(
            status_code=500,
            detail="Stored campus routing data is invalid.",
        ) from exc
    except ConnectionError as exc:
        logger.error("Congestion route database connection is unavailable.")
        raise HTTPException(
            status_code=503,
            detail="Campus routing database is unavailable.",
        ) from exc