"""
Health-check and system-information endpoints.

GET /api/health        — always responds, independent of the database
GET /api/health/database — checks database connectivity
GET /api/info          — project metadata (no secrets)
"""

from fastapi import APIRouter

from app.core.config import settings
from app.database.connection import check_database_health
from app.schemas.health import (
    DatabaseHealthResponse,
    HealthResponse,
    InfoResponse,
)

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Application health check.

    Works without a database connection so the API can always report
    its own liveness.
    """
    return HealthResponse(
        status="ok",
        service="sentinel-evacos-api",
        version=settings.VERSION,
    )


@router.get("/health/database", response_model=DatabaseHealthResponse)
async def database_health_check():
    """
    Database connectivity check.

    Returns the database status without exposing credentials.
    """
    result = await check_database_health()
    return DatabaseHealthResponse(**result)


@router.get("/info", response_model=InfoResponse)
async def system_info():
    """
    Project metadata.

    Returns public project information.
    Never exposes secrets, tokens, or connection strings.
    """
    return InfoResponse(
        project=settings.PROJECT_NAME,
        description=settings.PROJECT_DESCRIPTION,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        api_status="operational",
        documentation_url="/docs",
    )
