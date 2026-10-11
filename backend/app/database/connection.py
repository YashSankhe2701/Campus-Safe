"""
Database connection management.

Uses a serverless-friendly approach — no permanently open connections.
Connection configuration comes exclusively from environment variables.
"""

import logging
import asyncio

from app.core.config import settings

logger = logging.getLogger("campus_safe")

# Optional: Supabase Python client
# This is only imported when actually needed for database operations.
_supabase_client = None


def _get_supabase_client():
    """
    Lazily initialise and return a Supabase client.

    Returns None if Supabase is not configured.
    This ensures the API can start even without database credentials.
    """
    global _supabase_client

    if _supabase_client is not None:
        return _supabase_client

    supabase_key = settings.SUPABASE_PUBLISHABLE_KEY or settings.SUPABASE_SECRET_KEY
    if not settings.SUPABASE_URL or not supabase_key:
        logger.warning(
            "Supabase URL or key not configured. "
            "Database operations will be unavailable."
        )
        return None

    try:
        from supabase import create_client

        _supabase_client = create_client(
            settings.SUPABASE_URL,
            supabase_key,
        )
        logger.info("Supabase client initialised successfully.")
        return _supabase_client
    except ImportError:
        logger.warning(
            "supabase-py package not installed. "
            "Install it with: pip install supabase"
        )
        return None
    except Exception:
        logger.error("Failed to initialise Supabase client.")
        return None


def _probe_database() -> None:
    """Open a short-lived PostgreSQL connection and execute a read-only ping."""
    import psycopg

    with psycopg.connect(settings.SUPABASE_DB_URL, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            if cursor.fetchone() != (1,):
                raise ConnectionError("Database ping returned an unexpected result.")


async def check_database_health() -> dict:
    """
    Perform a lightweight database health check.

    Returns a dict with 'status' and 'database' keys.
    Does NOT expose credentials or connection details.
    """
    if not settings.SUPABASE_DB_URL:
        return {
            "status": "not_configured",
            "database": "supabase",
            "message": "Supabase PostgreSQL connection is not configured.",
        }

    try:
        await asyncio.to_thread(_probe_database)
        return {
            "status": "ok",
            "database": "supabase",
        }
    except Exception:
        logger.error("Database connectivity check failed.")
        return {
            "status": "error",
            "database": "supabase",
            "message": "Database connectivity check failed.",
        }
