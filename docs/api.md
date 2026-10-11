# CAMPUS-SAFE API Reference

> **Phase: Foundation (Phase 1)**

## Base URL

- **Development**: `http://localhost:8000`
- **Production**: Set via `NEXT_PUBLIC_API_URL`

## Interactive Documentation

- **Swagger UI**: `GET /docs`
- **ReDoc**: `GET /redoc`

---

## Endpoints

### `GET /api/health`

Application health check. Always responds, independent of database status.

**Response** `200 OK`

```json
{
  "status": "ok",
  "service": "campus-safe-api",
  "version": "0.1.0"
}
```

---

### `GET /api/health/database`

Database connectivity check. Returns database status without exposing credentials.

**Response** `200 OK` (database available)

```json
{
  "status": "ok",
  "database": "supabase"
}
```

**Response** `200 OK` (database not configured)

```json
{
  "status": "not_configured",
  "database": "supabase",
  "message": "Database configuration not provided."
}
```

**Response** `200 OK` (database unavailable)

```json
{
  "status": "error",
  "database": "supabase",
  "message": "Database connectivity check failed."
}
```

---

### `GET /api/info`

Project metadata. Never exposes secrets, tokens, or connection strings.

**Response** `200 OK`

```json
{
  "project": "CAMPUS-SAFE",
  "description": "AI-Based Smart Campus Emergency Management System",
  "version": "0.1.0",
  "environment": "development",
  "api_status": "operational",
  "documentation_url": "/docs"
}
```

---

## Error Responses

All errors return a consistent JSON structure:

```json
{
  "detail": "Human-readable error message",
  "status": "error"
}
```

- `400` — Bad Request
- `404` — Not Found
- `500` — Internal Server Error (details logged server-side, never exposed)

## Security

- No secrets in responses
- No stack traces in production
- CORS restricted to configured origins
- Input validated via Pydantic schemas
