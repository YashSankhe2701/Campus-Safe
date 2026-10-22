# Sentinel EvacOS API Reference

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
  "service": "sentinel-evacos-api",
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
  "project": "Sentinel EvacOS",
  "description": "AI-Based Smart Campus Emergency Management System",
  "version": "0.1.0",
  "environment": "development",
  "api_status": "operational",
  "documentation_url": "/docs"
}
```

---

### `GET /api/campuses/{campus_id}/graph`

Returns campus topology summary metadata (node, edge, floor, and building counts).

---

### `POST /api/campuses/{campus_id}/routes/shortest`

Calculates the shortest physical distance path between two nodes using Dijkstra's algorithm.

**Request Body**
```json
{
  "start_node_id": "20000000-0000-4000-8000-000000000001",
  "destination_node_id": "20000000-0000-4000-8000-000000000006"
}
```

---

### `POST /api/campuses/{campus_id}/routes/astar`

Calculates the shortest path using the A* heuristic search algorithm.

**Request Body**
```json
{
  "start_node_id": "20000000-0000-4000-8000-000000000001",
  "destination_node_id": "20000000-0000-4000-8000-000000000006"
}
```

---

### `POST /api/campuses/{campus_id}/routes/emergency`

Calculates an emergency-aware path avoiding active hazard-affected nodes and edges while minimizing total hazard risk exposure.

**Request Body**
```json
{
  "start_node_id": "20000000-0000-4000-8000-000000000001",
  "destination_node_id": "20000000-0000-4000-8000-000000000006",
  "alpha": 0.5
}
```

---

### `POST /api/campuses/{campus_id}/routes/evacuation`

Selects the nearest reachable exit by physical distance, taking into account one-way egress edges and dynamic hazard blockages without mutating database state.

**Request Body**
```json
{
  "start_node_id": "20000000-0000-4000-8000-000000000009",
  "blocked_edge_ids": [
    "30000000-0000-4000-8000-000000000009"
  ],
  "blocked_node_ids": []
}
```

---

### `POST /api/campuses/{campus_id}/routes/congestion`

Computes congestion-weighted travel time routes considering current crowd levels or scenario-injected edge congestion scores.

---

### `POST /api/campuses/{campus_id}/routes/predicted-time`

Predicts route evacuation travel time using an offline-trained scikit-learn Random Forest regressor. Fails gracefully with HTTP 503 if ML artifacts are missing.

---

## Error Responses

All errors return a consistent, sanitized JSON structure:

```json
{
  "detail": "Human-readable error message",
  "status": "error"
}
```

- `400` — Bad Request (invalid format or parameters)
- `404` — Not Found (campus, node, or route unreachable)
- `409` — Conflict (requested route blocked by hazard)
- `422` — Unprocessable Entity (input schema validation error)
- `500` — Internal Server Error (logged securely server-side; credentials never exposed)
- `503` — Service Unavailable (database or ML model artifact offline)

## Security and Privacy

- No secrets, passwords, or connection strings in responses or logs.
- No internal stack traces returned in production.
- CORS restricted to configured origins without wildcard credentials.
- Input validated via strict Pydantic models and UUID constraints.
