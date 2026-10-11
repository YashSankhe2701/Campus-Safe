"""Campus-scoped distance-based exit selection endpoint."""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.database.emergency_repository import EmergencyConditionDataError
from app.schemas.exit_selection import ExitSelectionRequest, ExitSelectionResponse
from app.services.emergency_routing_service import (
    EmergencyConditionDataError as EmergencyRoutingConditionError,
)
from app.services.exit_selection_service import (
    ExitDataError,
    load_campus_exit_selection,
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
    "/{campus_id}/routes/evacuation",
    response_model=ExitSelectionResponse,
)
async def select_evacuation_exit(
    campus_id: UUID,
    request: ExitSelectionRequest,
) -> ExitSelectionResponse:
    """Select the nearest reachable active exit by physical distance."""
    try:
        return await load_campus_exit_selection(
            str(campus_id),
            request.start_node_id,
        )
    except CampusNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Campus not found.") from exc
    except RouteNodeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NoRouteFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (
        GraphDataError,
        ExitDataError,
        EmergencyConditionDataError,
        EmergencyRoutingConditionError,
        InvalidRouteGraphError,
    ) as exc:
        logger.error("Invalid exit or route data for campus %s: %s", campus_id, exc)
        raise HTTPException(
            status_code=500,
            detail="Stored campus exit or routing data is invalid.",
        ) from exc
    except ConnectionError as exc:
        logger.error("Exit-selection database connection is unavailable.")
        raise HTTPException(
            status_code=503,
            detail="Campus routing database is unavailable.",
        ) from exc