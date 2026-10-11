# CAMPUS-SAFE Development Guide

> **Phase: 5 — Synthetic Route-Time Prediction Experiment**

## Prerequisites

- **Node.js** 18+ (for frontend)
- **Python** 3.11+ (for backend)
- **npm** (comes with Node.js)

## Quick Start

### 1. Clone and configure

```bash
git clone <repository-url>
cd campus-safe
cp .env.example .env
# Edit .env with your Supabase credentials (optional for foundation)
```

### 2. Start the backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend will be available at: **http://localhost:8000**
API docs at: **http://localhost:8000/docs**

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend will be available at: **http://localhost:3000**

## Project Structure

```
campus-safe/
├── frontend/          # Next.js application
│   ├── app/           # App Router pages
│   ├── components/    # React components
│   ├── lib/           # API layer, utilities
│   ├── hooks/         # Custom React hooks
│   └── types/         # TypeScript type definitions
├── backend/           # FastAPI application
│   ├── app/
│   │   ├── main.py    # Entry point
│   │   ├── api/       # Route handlers
│   │   ├── core/      # Config, logging
│   │   ├── models/    # Data models
│   │   ├── schemas/   # Pydantic schemas
│   │   ├── services/  # Business logic
│   │   └── database/  # DB connection, graph and data repositories
│   └── tests/         # Backend tests
├── supabase/
│   ├── migrations/    # Versioned schema migrations
│   └── seed.sql       # Synthetic demo campus
├── ai/                # AI modules (future)
├── data/              # Data files (future)
├── simulation/        # Simulation (future)
├── docs/              # Documentation
└── tests/             # Integration tests
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Application health check |
| GET | `/api/health/database` | Database connectivity check |
| GET | `/api/info` | Project information |
| GET | `/api/campuses/{campus_id}/graph` | Load and summarize a campus graph |
| POST | `/api/campuses/{campus_id}/routes/shortest` | Minimum-distance route between two campus nodes |
| POST | `/api/campuses/{campus_id}/routes/astar` | A* minimum-distance route between two campus nodes |
| POST | `/api/campuses/{campus_id}/routes/emergency-aware` | Distance route excluding applicable persisted blocks |
| POST | `/api/campuses/{campus_id}/routes/evacuation` | Evaluate exits and select the nearest reachable active exit |
| POST | `/api/campuses/{campus_id}/routes/congestion-scenario` | Scenario-based travel-time-minimizing route |
| POST | `/api/campuses/{campus_id}/routes/predicted-time` | Synthetic-trained per-person route-time estimate |

## Campus Graph Loading

The graph-loading path is:

```text
Supabase PostgreSQL
	→ Graph Repository
		→ Graph Service (validation and graph construction)
			→ NetworkX MultiDiGraph
				→ Future routing algorithms
```

PostgreSQL remains the persistent source of truth. NetworkX is a fresh computational representation constructed for each graph-service invocation; graphs are not held in global state or cached, making the operation compatible with stateless/serverless workers.

The loader retrieves only static `graph_nodes` and `graph_edges` for the requested campus. It checks node IDs, endpoint existence, positive finite distances/speeds, positive capacity, and self-loops before returning. Bidirectional stored edges become two directed traversal arcs; one-way edges remain a single arc. Invalid stored topology raises a graph data error instead of being silently skipped.

The endpoint `GET /api/campuses/{campus_id}/graph` returns counts, node-type totals, edge direction counts, and graph type. It does not return node/edge records or the internal NetworkX object. Try it with the synthetic campus ID from `supabase/seed.sql`:

```text
GET http://localhost:8000/api/campuses/10000000-0000-4000-8000-000000000001/graph
```

## Dijkstra Baseline Routing

The endpoint `POST /api/campuses/{campus_id}/routes/shortest` accepts UUID node IDs:

```json
{
	"start_node_id": "20000000-0000-4000-8000-000000000001",
	"destination_node_id": "20000000-0000-4000-8000-000000000002"
}
```

It returns `campus_id`, both requested node IDs, the ordered `path_node_ids`, `total_distance_m`, and `steps`. Each step names the source and destination node, exact selected `edge_id`, and `distance_m`. The total equals the sum of the returned step distances. For parallel edges, the lowest-distance traversable edge is selected; ties are resolved by edge ID. One-way edges remain directed.

## A* Baseline and Comparison

`POST /api/campuses/{campus_id}/routes/astar` accepts the same request body and returns the same response schema as the Dijkstra endpoint. It reports ordered node IDs, total metres, and exact selected edge IDs and distances for every step. Both algorithms respect directed traversal and choose the lowest-distance available edge among parallel connections.

A* uses NetworkX with physical edge distance as its edge weight and a **zero heuristic**. Node `x_coordinate` and `y_coordinate` values exist, but their units are not specified as metres and no lower-bound relationship to edge distances has been established. Therefore a geometric heuristic could overestimate; zero is the safe admissible choice. A* and Dijkstra tests compare minimum total distance and path validity rather than requiring identical node sequences when shortest paths tie. With zero heuristic, A* preserves optimality but does not get the usual search-efficiency gain.

Both algorithms optimize distance only. They do not consider safety, emergency risk, blockages, crowding, congestion, or changing speeds. Neither currently guarantees a safe evacuation route, and neither is ready to provide real emergency evacuation guidance.

## Emergency-Aware Routing Prototype

`POST /api/campuses/{campus_id}/routes/emergency-aware` accepts the standard route body containing `start_node_id` and `destination_node_id`. It returns the route nodes, selected persisted edge IDs, per-step distances, total distance, active emergency IDs, counts of blocked nodes/edges applied, and an explicit risk-weighting status.

The backend reads the existing emergency and condition tables without changing the static campus graph or writing to PostgreSQL. `status = active`, a started `started_at`, and null `ended_at` define an applicable emergency. Emergency-scoped rows apply only to active emergencies; current rows with null `emergency_id` apply regardless of active emergency state. Applicable blocks are combined with OR precedence. A blocked edge is removed in both traversal directions for its persisted edge ID; a blocked node is excluded from traversal. If no path remains, the endpoint returns 404 and never retries through a blocked element. With no active emergency and no current blockage records, it returns the ordinary minimum-distance route.

The route cost is exactly `sum(edge.distance)` in metres; there is no risk coefficient or dimensionally mixed score. Although the database bounds `risk_score` to `[0, 1]`, its meaning, source, calibration, and provenance are not documented, so it is not treated as a valid risk measure. The response explicitly reports `risk_weighting_applied: false`. The schema has `updated_at` but no TTL or freshness rule; current null-emergency blocks remain applicable until changed/cleared. Absence of a condition record is not evidence of safety.

This is an initial routing prototype, not a validated real-world evacuation system. A route that avoids persisted blockages is not automatically safe. Risk-aware weights require documented score semantics/provenance and review of a dimensionally coherent coefficient model; stale-condition handling requires a defined expiration policy.

## Exit Selection and Recalculation

`POST /api/campuses/{campus_id}/routes/evacuation` accepts a JSON body with `start_node_id`. Exit records come from the existing `exits` table and map to topology through `exits.node_id`. Only `is_active` exits whose nodes are not blocked and are reachable are eligible. Eligible exits are ranked by remaining route distance in metres, with exit UUID as the deterministic tie-break. The response contains the selected exit and route (when one exists), all evaluated exits with distance or an exclusion reason, and a notice that the selection is not a safety guarantee. Exit capacity and undocumented risk do not affect ranking.

The endpoint reloads the graph, exits, and emergency conditions from PostgreSQL for each invocation. A client explicitly requests recalculation by calling it again; condition changes do not trigger polling, WebSockets, notifications, or automatic rerouting. With no eligible exits the endpoint returns HTTP 200 and `status: "no_route"`, with a null selected exit and an evaluated-exit list; invalid resources and requests retain the API's 404/422 conventions.

This chooses the nearest reachable active exit based on recorded blockages, not the safest exit. A blockage-free route is not a validated real-world evacuation recommendation.

## Crowd and Congestion Scenario Model

The current schema has static node `capacity` (nullable, non-negative) and edge `base_capacity` (positive), plus `node_conditions.people_count`, `edge_conditions.people_count`, `crowd_density`, `congestion_score`, `effective_speed`, and `updated_at`. Live Supabase currently contains no node/edge condition rows. The schema does not document whether capacity means persons or throughput, what units `crowd_density`/`effective_speed` use, how congestion scores are derived, or whether `updated_at` is the observation time. The service therefore does not treat these fields as live, calibrated measurements.

The new independent pure model and `POST /api/campuses/{campus_id}/routes/congestion-scenario` use explicitly supplied scenario values: occupancy and capacity in people, an observation timestamp, and a base walking speed in metres per second. They are not written to the database and the response states `data_mode: "explicit_scenario_inputs"` and `live_crowd_measurements_used: false`.

For a valid fresh sample:

- `density_ratio = occupancy_people / capacity_people` (dimensionless; may exceed 1).
- `congestion_score = min(density_ratio, 1)` (dimensionless, bounded `[0, 1]`; a simple linear scenario index, not empirically validated).
- `effective_speed_mps = base_walking_speed_mps / (1 + congestion_score)`.
- `estimated_travel_time_s = distance_m / effective_speed_mps`.

The request requires positive capacity and speed, non-negative occupancy, and timezone-aware observation timestamps. Samples older than 15 minutes are stale. A missing edge sample, missing observation time, or stale sample is reported explicitly and receives unadjusted baseline time (`distance_m / base_walking_speed_mps`); it is not reported as zero crowd or low congestion. Density ratios above capacity are preserved and marked `over_capacity`, while the congestion score saturates at 1.0. Blocked nodes/edges are removed with Phase 3D rules before time routing. This is a scenario comparison only, not measured travel time, live crowd awareness, or a safe-route claim.

## Synthetic ML Experiment

Run the deterministic offline experiment from the repository root using the backend environment:

```powershell
python ai/prediction/train_experiment.py
```

It generates Phase 4-formula labels for synthetic route templates, groups the train/test split by route template, compares an analytical baseline with a Random Forest, and calculates held-out MAE/RMSE in seconds and R² from actual predictions. The CSV, evaluation report, and model are written only to the Git-ignored `ai/prediction/artifacts/` directory. See [docs/ml.md](ml.md) for feature units, split details, actual metrics, and limitations.

`POST /api/campuses/{campus_id}/routes/predicted-time` accepts a specific node/edge path, base speed, and optional explicit scenario samples. The backend reloads topology and emergency conditions, rejects a path containing currently blocked nodes/edges, derives the same feature schema used for training, then loads the saved artifact. Training never runs in the request path. The response identifies the synthetic model version and its validation limitation. Prediction is for one person along a supplied route; it is not whole-campus clearance time and is not validated against real evacuation observations.

Run the backend and frontend checks from their respective directories:

```powershell
cd backend
python -m pytest -q
cd ../frontend
npm run build
```

The live graph, Dijkstra, A*, emergency-aware, exit-selection, congestion, and prediction API tests use the synthetic demo campus configured in the database and skip database integration only if `SUPABASE_DB_URL` is not configured. Routing/condition checks do not insert test emergencies or conditions.

## Running Tests

```bash
cd backend
python -m pytest tests/ -v
```

## Environment Variables

See `.env.example` for all required variables.

**Important**: The API works without Supabase credentials configured.
Health check and info endpoints will function normally.
Database health will report "not_configured".

## Code Style

- **Frontend**: TypeScript strict mode, ESLint
- **Backend**: Type hints, Pydantic validation
- **Both**: Clear naming, small functions, modular architecture
