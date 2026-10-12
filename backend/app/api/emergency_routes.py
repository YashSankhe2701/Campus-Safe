"""Campus-scoped initial emergency-aware routing endpoint."""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.routing import (
    EmergencyAwareRouteRequest,
    EmergencyAwareRouteResponse,
)
from app.services.emergency_routing_service import (
    EmergencyConditionDataError,
    load_emergency_aware_route,
)
from app.services.graph_service import CampusNotFoundError, GraphDataError
from app.services.routing_service import (
    InvalidRouteGraphError,
    NoRouteFoundError,
    RouteNodeNotFoundError,
)

logger = logging.getLogger("campus_safe")
router = APIRouter(prefix="/api/campuses", tags=["routes"])


@router.post(
    "/{campus_id}/routes/emergency-aware",
    response_model=EmergencyAwareRouteResponse,
)
async def get_emergency_aware_route(
    campus_id: UUID,
    request: EmergencyAwareRouteRequest,
) -> EmergencyAwareRouteResponse:
    """Avoid persisted active/current blockages while minimizing distance."""
    try:
        route, conditions = await load_emergency_aware_route(
            str(campus_id),
            request.start_node_id,
            request.destination_node_id,
            blocked_edge_ids=request.blocked_edge_ids,
            blocked_node_ids=request.blocked_node_ids,
        )
    except CampusNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Campus not found.") from exc
    except RouteNodeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NoRouteFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (GraphDataError, EmergencyConditionDataError, InvalidRouteGraphError) as exc:
        logger.error("Invalid topology or emergency condition data for campus %s: %s", campus_id, exc)
        raise HTTPException(
            status_code=500,
            detail="Stored campus routing data is invalid.",
        ) from exc
    except ConnectionError as exc:
        logger.error("Emergency-aware routing database connection is unavailable.")
        raise HTTPException(
            status_code=503,
            detail="Campus routing database is unavailable.",
        ) from exc

    return EmergencyAwareRouteResponse(
        **route.model_dump(),
        active_emergency_ids=conditions.active_emergency_ids,
        blocked_edge_count=len(conditions.blocked_edge_ids),
        blocked_node_count=len(conditions.blocked_node_ids),
    )