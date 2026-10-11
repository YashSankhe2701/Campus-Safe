# CAMPUS-SAFE Architecture

> **Phase: 5 — Synthetic Route-Time Prediction Experiment**

## System Architecture

```
┌─────────────────────────────────────────┐
│              CAMPUS-SAFE USER           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│         Next.js Frontend (Vercel)       │
│  TypeScript · App Router · Tailwind CSS │
│  shadcn/ui · Lucide Icons              │
└────────────────┬────────────────────────┘
                 │ API Requests
                 ▼
┌─────────────────────────────────────────┐
│       FastAPI Backend (Vercel/Python)   │
│  Pydantic · Service Layer · Repository  │
│         ┌──────┴──────┐                 │
│         ▼             ▼                 │
│  Application    AI Services             │
│    Logic        (future)                │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│         Supabase PostgreSQL             │
│  Persistent source of truth              │
│  Static topology + dynamic state         │
└────────────────┬────────────────────────┘
       │ per-invocation topology read
       ▼
┌─────────────────────────────────────────┐
│ Graph Repository → Graph Service        │
│ Validated, in-memory NetworkX MultiDiGraph│
└─────────────────────────────────────────┘
       │
       ▼
       Explicit-scenario crowd model; congestion-time route prototype
```

## Deployment Architecture

```
GitHub Repository
       │
       ▼
┌──────────────────┐     ┌──────────────────┐
│     Vercel       │     │    Supabase      │
│  ┌────────────┐  │     │  ┌────────────┐  │
│  │  Next.js   │  │     │  │ PostgreSQL │  │
│  │  Frontend  │  │     │  └────────────┘  │
│  └────────────┘  │     │  ┌────────────┐  │
│  ┌────────────┐  │     │  │  Realtime  │  │
│  │  FastAPI   │  │     │  │  (future)  │  │
│  │  Backend   │  │     │  └────────────┘  │
│  └────────────┘  │     │  ┌────────────┐  │
└──────────────────┘     │  │   Auth     │  │
                         │  │  (future)  │  │
                         │  └────────────┘  │
                         │  ┌────────────┐  │
                         │  │  Storage   │  │
                         │  │  (future)  │  │
                         │  └────────────┘  │
                         └──────────────────┘
```

## Data Flow

```
User Action
  → Next.js Page / Component
    → API Layer (lib/api.ts)
      → fetch() to FastAPI
        → Service Layer
            → Repository Layer → Supabase PostgreSQL
            → Graph Service → NetworkX graph
```

## Key Design Decisions

1. **Separation of concerns**: Frontend never talks to Supabase directly. All data flows through FastAPI.
2. **Repository pattern**: Database logic is abstracted behind `BaseRepository`. Swapping Supabase for another DB requires only a new repository implementation.
3. **Serverless-friendly**: Database health uses a short-lived PostgreSQL connection; there are no background workers or filesystem state.
4. **Environment-driven configuration**: All secrets and URLs come from environment variables; database credentials stay server-side.
5. **CORS restrictive by default**: Only whitelisted origins are allowed.
6. **Static/dynamic data separation**: Campuses, buildings, floors, graph nodes, graph edges, exits, and assembly points describe persistent topology. Emergencies, affected-entity records, and node/edge conditions describe temporary state separately.
7. **Campus-scoped integrity**: Composite foreign keys prevent graph and emergency records from crossing campus boundaries. RLS is enabled without permissive policies; the frontend does not access PostgreSQL directly.

## Campus Graph Data

`graph_nodes` are graph vertices and `graph_edges` are connections. Each edge stores only base topology attributes; direction is represented by `bidirectional`, and temporary blockages/risk/crowding live in the condition and emergency relationship tables. Floors may have signed floor numbers, while outdoor nodes may have no floor.

The graph loader reads static campus nodes and edges from PostgreSQL through a short-lived repository connection, validates every record, then constructs a fresh NetworkX `MultiDiGraph` for that invocation. PostgreSQL remains the persistent source of truth; NetworkX is only the computational representation. Bidirectional database edges become explicit forward and reverse arcs, while one-way edges remain one-way. No graph cache or background worker is used.

`GET /api/campuses/{campus_id}/graph` returns graph metadata only. `POST /api/campuses/{campus_id}/routes/shortest` loads a fresh campus graph and runs NetworkX Dijkstra using physical edge distance as its weight. `POST /api/campuses/{campus_id}/routes/astar` uses NetworkX A* with the same edge objective and response contract. Both account for direction and select the lowest-distance parallel arc while including its persisted edge ID in each step.

The A* heuristic is identically zero. Although graph nodes have local `x_coordinate` and `y_coordinate` values, their units are undocumented and their geometric distances are not guaranteed to be lower bounds on every edge distance. Using a nonzero geometric heuristic could overestimate and break optimality. Zero is admissible and consistent, so A* retains shortest-distance guarantees and is comparable to Dijkstra, but has no usual heuristic-guided search-efficiency advantage yet. A future heuristic requires a documented coordinate unit and a proven admissible lower bound.

Both algorithms minimize physical distance only. They do not account for emergency risk, blocked or affected edges, crowd density, congestion, or changing speeds. Neither algorithm guarantees a safe evacuation route, and neither is production-ready for real emergency evacuation guidance. See [Database Schema](database.md) for the ER diagram, table definitions, migration workflow, RLS posture, and synthetic seed.

`POST /api/campuses/{campus_id}/routes/emergency-aware` uses the same topology loader and reads `emergencies`, `emergency_affected_nodes`, `emergency_affected_edges`, `node_conditions`, and `edge_conditions` in a short-lived read-only repeatable-read transaction. An emergency applies when `status = 'active'`, `started_at <= now()`, and `ended_at IS NULL`. Emergency-scoped affected/condition rows apply only to those emergencies; rows with `emergency_id IS NULL` represent current campus conditions and apply with or without an active emergency. All applicable `blocked = true` records are unioned (blockage wins); blocked nodes and every traversal arc for a blocked persisted edge ID are removed from a fresh graph copy. The original graph and database are not modified. If no emergency is active, current null-emergency conditions still apply; with no applicable records, the route is the ordinary distance-minimizing route.

Emergency-aware routing currently minimizes **distance in metres only** over the remaining graph. The schema constrains `risk_score` to `[0, 1]`, but does not document score meaning, source, calibration, or provenance. Therefore the service does not assign risk a coefficient or combine it with metres. The API marks `risk_weighting_applied: false` and `risk_weighting_status: "unavailable_unvalidated_semantics"`. `updated_at` is an observation timestamp, not an expiry policy; null-emergency current blocks remain in effect until replaced or cleared. No condition record does not imply an edge is safe.

This is an initial routing prototype, not a validated real-world evacuation system. Avoiding recorded blocks does not guarantee safety; the service does not validate that condition records are complete, current in the real world, or operationally correct. Defensible risk-aware costs require documented risk-score semantics/provenance and a reviewed coefficient model; stale-condition expiry requires an explicit TTL/freshness policy.

`POST /api/campuses/{campus_id}/routes/evacuation` loads fresh topology, persisted `exits`, and emergency conditions on every call. An exit is eligible only when `exits.is_active` is true, its `node_id` is present and not blocked, and the node is reachable under the current blockage snapshot. Candidates are ranked by total remaining physical distance in metres, then by exit UUID for deterministic ties. The existing `exits.node_id` foreign key supplies the mapping; `capacity` and type are returned only as applicable metadata and do not influence ranking. Unreachable/inactive/blocked exits are listed with reasons. No eligible candidate is represented as a `no_route` result. There is no cache or automatic polling: a client must request the endpoint again to recalculate after conditions change.

Exit selection finds the nearest reachable active exit under recorded conditions; it does not identify the safest exit and does not guarantee safe evacuation. The existing lack of validated risk semantics applies here as well.

`POST /api/campuses/{campus_id}/routes/congestion-scenario` is a separate scenario-only strategy. The request supplies `base_walking_speed_mps` and optional per-edge samples with occupancy/capacity counts in people and a timezone-aware `observed_at`. The service does not consume persisted `graph_edges.base_speed`, `base_capacity`, node `capacity`, `crowd_density`, `congestion_score`, or `effective_speed` as calibrated inputs: the current migration/docs do not establish their measurement units or semantics, and live `node_conditions`/`edge_conditions` currently contain no rows.

For each fresh explicit sample, the dimensionless occupancy ratio is $r = occupancy_{people} / capacity_{people}$ and the scenario congestion score is $c = min(r, 1)$. The original ratio is retained, so `over_capacity` is true and `density_ratio` may exceed one when occupancy exceeds nominal capacity. Samples older than 15 minutes are `stale`; absent samples and samples without timestamps are separately marked. A stale/missing sample has no score and receives the unadjusted scenario baseline time, while its status remains visible and contributes to the unknown-measurement count.

Given supplied base speed $v_0$ in m/s and graph edge distance $d$ in metres, the illustrative scenario model computes $v_{effective} = v_0 / (1 + c)$ and $t = d / v_{effective} = (d / v_0)(1 + c)$ seconds. This bounded monotonic transformation is an uncalibrated scenario assumption, not an empirical crowd-flow law. The strategy minimizes the sum of edge estimated seconds, while also returning physical distance and exact edge IDs. It first applies the existing Phase 3D blocked-node/edge filter, so blocked edges are never traversable.

The current database provides count/range fields (`people_count >= 0`, `crowd_density >= 0`, congestion and risk scores in `[0,1]`) and update timestamps, but no documented units/provenance, explicit measurement timestamp, or live observations. `updated_at` records row updates and is not a measurement-observation contract. The demo currently has zero node/edge condition rows. Therefore this endpoint reports `data_mode: explicit_scenario_inputs` and `live_crowd_measurements_used: false`; it does not claim live crowd awareness. No actual measurements or columns are fabricated or persisted.

This is a mathematical scenario prototype, not empirically validated crowd modelling or a real evacuation-time prediction. Its routes are not safety guarantees. Live integration requires defined units, measurement provenance and timestamps, capacity semantics, and validated speed/congestion relationships.

Phase 5 adds an offline Random Forest experiment under `ai/prediction/`. It predicts `estimated_travel_time_s` for one caller-specified route from explicit Phase 4-style features. Data generation uses the Phase 4 formula, and evaluation holds out complete route templates. The analytical Phase 4 formula is retained as a baseline; synthetic metrics measure only how well the model approximates those generated labels. The artifact is loaded for inference and training remains an offline command. No existing route endpoint is changed. See [ML Experiment](ml.md) for actual held-out metrics, dataset assumptions, artifacts, and limits.

## Technology Justification

| Technology | Reason |
|---|---|
| Next.js + App Router | Modern React framework with SSR, optimized for Vercel |
| TypeScript | Type safety across the frontend |
| Tailwind CSS | Utility-first CSS, explicitly requested |
| shadcn/ui | Accessible, composable UI components |
| FastAPI | Async Python, auto-docs, Pydantic validation |
| Supabase | Managed PostgreSQL with built-in auth, realtime, storage |
| Pydantic | Request/response validation and serialization |
