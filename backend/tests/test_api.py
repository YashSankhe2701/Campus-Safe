"""
Backend tests for CAMPUS-SAFE API.

Tests the health, info, and database-health endpoints.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.api import health as health_api
from app.core.config import Settings
from app.database import connection
from app.main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ---------- GET /api/health ----------

@pytest.mark.anyio
async def test_health_returns_200(client):
    """Health endpoint must always return 200, even without a database."""
    response = await client.get("/api/health")
    assert response.status_code == 200


@pytest.mark.anyio
async def test_health_response_structure(client):
    """Health response must contain status, service, and version."""
    response = await client.get("/api/health")
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "campus-safe-api"
    assert "version" in data


# ---------- GET /api/info ----------

@pytest.mark.anyio
async def test_info_returns_200(client):
    """Info endpoint must return 200."""
    response = await client.get("/api/info")
    assert response.status_code == 200


@pytest.mark.anyio
async def test_info_response_structure(client):
    """Info response must contain project metadata without secrets."""
    response = await client.get("/api/info")
    data = response.json()
    assert data["project"] == "CAMPUS-SAFE"
    assert "version" in data
    assert "environment" in data
    assert "api_status" in data
    # Must NOT contain sensitive fields
    assert "SUPABASE_SERVICE_ROLE_KEY" not in str(data)
    assert "password" not in str(data).lower()


# ---------- GET /api/health/database ----------

@pytest.mark.anyio
async def test_database_health_returns_200(client, monkeypatch):
    """Database health endpoint must return 200 even when DB is not configured."""
    async def not_configured():
        return {"status": "not_configured", "database": "supabase"}

    monkeypatch.setattr(health_api, "check_database_health", not_configured)
    response = await client.get("/api/health/database")
    assert response.status_code == 200


@pytest.mark.anyio
async def test_database_health_response_structure(client, monkeypatch):
    """Database health response must include status and database fields."""
    async def not_configured():
        return {"status": "not_configured", "database": "supabase"}

    monkeypatch.setattr(health_api, "check_database_health", not_configured)
    response = await client.get("/api/health/database")
    data = response.json()
    assert "status" in data
    assert "database" in data
    assert data["database"] == "supabase"


@pytest.mark.anyio
async def test_database_health_requires_successful_postgres_probe(monkeypatch):
    """A healthy response requires a successful PostgreSQL query."""
    calls = []
    monkeypatch.setattr(connection.settings, "SUPABASE_DB_URL", "configured")

    def successful_probe():
        calls.append(True)

    monkeypatch.setattr(connection, "_probe_database", successful_probe)
    result = await connection.check_database_health()

    assert result["status"] == "ok"
    assert calls == [True]


@pytest.mark.anyio
async def test_database_health_reports_probe_failure(monkeypatch):
    """A failed PostgreSQL query must never be reported as healthy."""
    monkeypatch.setattr(connection.settings, "SUPABASE_DB_URL", "configured")

    def failed_probe():
        raise OSError("connection failed")

    monkeypatch.setattr(connection, "_probe_database", failed_probe)
    result = await connection.check_database_health()

    assert result["status"] == "error"


def test_current_supabase_key_names_map_to_client_settings(monkeypatch):
    """Current Supabase keys map internally without confusing JWKS for DB URL."""
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-placeholder")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "secret-placeholder")
    monkeypatch.setenv("SUPABASE_JWKS_URL", "https://example.supabase.co/auth/v1/.well-known/jwks.json")
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)

    configured = Settings()

    assert configured.SUPABASE_ANON_KEY == "publishable-placeholder"
    assert configured.SUPABASE_SERVICE_ROLE_KEY == "secret-placeholder"
    assert configured.SUPABASE_JWKS_URL.endswith("jwks.json")
    assert configured.SUPABASE_DB_URL == ""


def test_supabase_client_prefers_publishable_key(monkeypatch):
    """Ordinary Supabase client operations should use the public key first."""
    client = object()
    calls = []

    def fake_create_client(url, key):
        calls.append((url, key))
        return client

    monkeypatch.setattr("supabase.create_client", fake_create_client)
    monkeypatch.setattr(connection, "_supabase_client", None)
    monkeypatch.setattr(connection.settings, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(connection.settings, "SUPABASE_PUBLISHABLE_KEY", "publishable-placeholder")
    monkeypatch.setattr(connection.settings, "SUPABASE_SECRET_KEY", "secret-placeholder")

    assert connection._get_supabase_client() is client
    assert calls == [("https://example.supabase.co", "publishable-placeholder")]


# ---------- GET / ----------

@pytest.mark.anyio
async def test_root_returns_welcome(client):
    """Root endpoint returns welcome message with navigation links."""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
