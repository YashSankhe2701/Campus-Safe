"""
Response schemas for health and info endpoints.

Typed Pydantic models ensure consistent, validated API responses.
"""

from typing import Optional

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """GET /api/health response."""

    status: str
    service: str
    version: str


class DatabaseHealthResponse(BaseModel):
    """GET /api/health/database response."""

    status: str
    database: str
    message: Optional[str] = None


class InfoResponse(BaseModel):
    """GET /api/info response."""

    project: str
    description: str
    version: str
    environment: str
    api_status: str
    documentation_url: str
