"""
Sentinel EvacOS API — FastAPI entry point.

This module creates and configures the FastAPI application,
registers routers, configures CORS, and handles lifecycle events.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.health import router as health_router
from app.api.campuses import router as campuses_router
from app.api.routes import router as routes_router
from app.api.astar import router as astar_router
from app.api.emergency_routes import router as emergency_routes_router
from app.api.evacuation_routes import router as evacuation_routes_router
from app.api.congestion_routes import router as congestion_routes_router
from app.api.predictions import router as predictions_router
from app.core.config import settings
from app.core.logging import logger


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown hooks
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info(
        "Starting %s v%s [%s]",
        settings.PROJECT_NAME,
        settings.VERSION,
        settings.ENVIRONMENT,
    )
    if settings.has_database_config:
        logger.info("Database configuration detected.")
    else:
        logger.warning(
            "No database configuration found. "
            "The API will run without database connectivity."
        )
    yield
    logger.info("Shutting down %s.", settings.PROJECT_NAME)


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------
app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.PROJECT_DESCRIPTION,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — restrictive by default, configurable via environment
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health_router)
app.include_router(campuses_router)
app.include_router(routes_router)
app.include_router(astar_router)
app.include_router(emergency_routes_router)
app.include_router(evacuation_routes_router)
app.include_router(congestion_routes_router)
app.include_router(predictions_router)


# ---------------------------------------------------------------------------
# Global error handler — never expose stack traces or secrets
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch-all error handler.

    Logs the real error server-side but returns only a safe message to the client.
    """
    logger.error(
        "Unhandled error on %s %s (%s)",
        request.method,
        request.url.path,
        type(exc).__name__,
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal server error occurred.",
            "status": "error",
        },
    )


# ---------------------------------------------------------------------------
# Root redirect
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
async def root():
    """Redirect root to API docs."""
    return {
        "message": f"Welcome to {settings.PROJECT_NAME} API",
        "docs": "/docs",
        "health": "/api/health",
    }
