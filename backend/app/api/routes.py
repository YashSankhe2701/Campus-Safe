"""Campus-scoped baseline routing endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.routing import ShortestRouteRequest, ShortestRouteResponse
from app.services.graph_service import (
    CampusNotFoundError,
    GraphDataError,
    load_campus_graph,
)
from app.services.routing_service import (
    InvalidRouteGraphError,
    NoRouteFoundError,
    RouteNodeNotFoundError,
    calculate_shortest_route,
)

logger = logging.getLogger("campus_safe")
router = APIRouter(prefix="/api/campuses", tags=["routes"])


@router.post("/{campus_id}/routes/shortest", response_model=ShortestRouteResponse)
async def get_shortest_route(
    campus_id: UUID,
    request: ShortestRouteRequest,
) -> ShortestRouteResponse:
    """Return the minimum-physical-distance route using Dijkstra's algorithm."""
    try:
        graph = await load_campus_graph(str(campus_id))
    except CampusNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Campus not found.") from exc
    except GraphDataError as exc:
        logger.error("Invalid graph data for campus %s: %s", campus_id, exc)
        raise HTTPException(
            status_code=500,
            detail="Stored campus graph data is invalid.",
        ) from exc
    except ConnectionError as exc:
        logger.error("Graph database connection is unavailable.")
        raise HTTPException(
            status_code=503,
            detail="Campus graph database is unavailable.",
        ) from exc

    try:
        return calculate_shortest_route(
            graph,
            request.start_node_id,
            request.destination_node_id,
        )
    except RouteNodeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NoRouteFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidRouteGraphError as exc:
        logger.error("Invalid routing graph for campus %s: %s", campus_id, exc)
        raise HTTPException(
            status_code=500,
            detail="Stored campus graph data is invalid for routing.",
        ) from exc