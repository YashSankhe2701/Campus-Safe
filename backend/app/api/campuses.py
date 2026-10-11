"""Campus topology inspection endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.graph import CampusGraphSummaryResponse
from app.services.graph_service import (
    CampusNotFoundError,
    GraphDataError,
    load_campus_graph,
    summarize_campus_graph,
)

logger = logging.getLogger("campus_safe")
router = APIRouter(prefix="/api/campuses", tags=["campuses"])


@router.get("/{campus_id}/graph", response_model=CampusGraphSummaryResponse)
async def get_campus_graph(campus_id: UUID) -> CampusGraphSummaryResponse:
    """Load campus topology and return summary metadata, not graph contents."""
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

    return CampusGraphSummaryResponse(**summarize_campus_graph(graph))