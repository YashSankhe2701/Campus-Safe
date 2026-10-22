# Sentinel EvacOS

**AI-Based Smart Campus Emergency Management System**

> Intelligent emergency response, multi-strategy graph routing, dynamic hazard-aware evacuation, and synthetic travel-time prediction for smart campuses.

[![Version](https://img.shields.io/badge/Version-0.1.0-green)]()
[![Status](https://img.shields.io/badge/Status-Interactive%20Routing%20%26%20Evacuation-blue)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

---

## Overview

Sentinel EvacOS is an intelligent emergency management and navigation platform designed for educational campuses. It integrates physical campus topology modeling, multi-strategy routing algorithms, dynamic in-flight hazard rerouting, and offline-trained machine learning models to identify safe, unobstructed egress paths during emergencies.

### Implemented Capabilities

- **Interactive Campus Visualizer**: Vector SVG rendering with pan/zoom navigation, floor filtering (All Floors, Ground Floor, First Floor), telemetry cards, and responsive state indicators.
- **Multi-Strategy Routing Engine**:
  - *Shortest Physical Distance (Dijkstra)*: Classic shortest-path computation on weighted directed edges.
  - *Heuristic Search (A\*)*: Euclidean heuristic accelerated path calculation.
  - *Dynamic Hazard Evacuation (Exit Selection)*: Selects the nearest reachable exit while enforcing one-way egress directions and handling dynamic blockages.
  - *Risk-Minimizing Emergency Avoidance*: Configurable multi-objective optimization balancing physical distance against active hazard severity.
  - *Congestion-Aware Routing*: Evaluates real-time or simulated crowd densities to route around congested corridors.
  - *ML Travel-Time Prediction*: Evaluates route characteristics using an offline Random Forest regressor trained on simulated crowd scenarios.
- **Hazard Simulation Controls**: In-browser testing presets (Baseline, 1st Floor Fire Escape Blocked, West Ground Emergency Exit Blocked, All Administration Exits Blocked) to verify dynamic rerouting behavior.
- **Categorized Error Diagnostics**: User-friendly diagnostics distinguish between unreachable destinations, backend network/CORS unavailability, invalid requests, and server outages.

---

## System Architecture and Data Flow

```
┌────────────────────────────────────────────────────────┐
│                   Browser Client                       │
│  Next.js 15 App Router · React · Tailwind CSS · SVG    │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ HTTPS / REST (lib/api.ts)
                            ▼
┌────────────────────────────────────────────────────────┐
│               FastAPI Application Gateway              │
│  - Restrictive CORS (No credential wildcards)          │
│  - Request Schema Validation (Pydantic / UUIDs)        │
│  - Non-leaking Exception Handlers                      │
└──────┬────────────────────┬────────────────────┬───────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────┐   ┌─────────────────┐   ┌────────────────┐
│ Graph Engine │   │ Exit Selection  │   │ ML Prediction  │
│ NetworkX     │   │ Dynamic Hazards │   │ Random Forest  │
│ MultiDiGraph │   │ In-Memory Egress│   │ Scikit-Learn   │
└──────┬───────┘   └────────┬────────┘   └────────┬───────┘
       │                    │                     │
       └────────────────────┼─────────────────────┘
                            │
                            │ Server-Side SQL Connection (psycopg)
                            ▼
┌────────────────────────────────────────────────────────┐
│              Supabase / PostgreSQL Database            │
│  - 12 Tables with Row-Level Security (RLS) Enabled     │
│  - Idempotent Versioned Migrations                     │
│  - Authoritative Seed Topology (Nodes, Edges, Exits)   │
└────────────────────────────────────────────────────────┘
```

### Data Flow Lifecycle

1. **Topology Ingestion**: Static campus geometry (campuses, buildings, floors, nodes, edges, exits) is seeded in PostgreSQL and loaded server-side into an in-memory NetworkX directed multigraph snapshot.
2. **Pathfinding Request**: The user selects origin, destination (or evacuation mode), and routing strategy in the Next.js frontend.
3. **Execution**: The FastAPI backend executes the requested graph algorithm. For evacuation routing, edge directionality and optional dynamic blockages (`blocked_edge_ids`, `blocked_node_ids`) are evaluated in-memory per request without mutating database state.
4. **Telemetry & Visualization**: The frontend renders the calculated route, traversal sequence, distance, travel time, and candidate exit evaluation table.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS, Lucide Icons |
| **Backend** | Python 3.11, FastAPI, Pydantic, Uvicorn, NetworkX |
| **Machine Learning** | Scikit-learn (Random Forest Regressor), Joblib, NumPy, Pandas |
| **Database** | PostgreSQL via Supabase (Server-side psycopg connection pool) |
| **Containerization** | Docker (python:3.11-slim) |

---

## Quick Start (Local Development)

### Prerequisites

- **Node.js** 18+ (tested on Node.js 20+)
- **Python** 3.11+
- **Git**

### 1. Environment Setup

Copy `.env.example` to `.env` at the root of the repository:

```bash
cp .env.example .env
```

Configure your environment variables as described in the [Environment Variables](#environment-variables) section. **Never commit `.env` or sensitive credentials to Git.**

### 2. Start the Backend (Port 8000)

```bash
cd backend
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- API Base: `http://localhost:8000`
- Swagger UI Documentation: `http://localhost:8000/docs`
- Health Endpoint: `http://localhost:8000/api/health`

### 3. Start the Frontend (Port 3001)

In a separate terminal:

```bash
cd frontend
npm install
npm run dev -- -p 3001
```

- Web Interface: `http://localhost:3001`

---

## Environment Variables

All configuration is loaded via environment variables. **Do not put secrets in client-side code.**

| Variable Name | Scope | Required | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Frontend | Yes | Base URL of the FastAPI backend (e.g., `http://localhost:8000` locally, or `https://api.yourdomain.com` in production). |
| `NEXT_PUBLIC_CAMPUS_ID` | Frontend | Optional | Default campus UUID. Defaults to demo campus `10000000-0000-4000-8000-000000000001`. |
| `ENVIRONMENT` | Backend | Yes | Deployment environment (`development` or `production`). |
| `PORT` | Backend | Optional | Port for Uvicorn (default: `8000`). |
| `CORS_ORIGINS` | Backend | Yes | Comma-delimited list of allowed browser origins (e.g., `http://localhost:3000,http://localhost:3001,https://campus-safe.vercel.app`). Wildcards are rejected. |
| `SUPABASE_DB_URL` | Backend Only | Yes (for live DB) | PostgreSQL connection URI (e.g., `postgresql://postgres:...@db...supabase.co:6543/postgres`). Never prefix with `NEXT_PUBLIC_`. |
| `SUPABASE_URL` | Backend | Optional | Supabase project API URL. |
| `SUPABASE_PUBLISHABLE_KEY` | Backend | Optional | Supabase publishable anonymous key. |
| `SUPABASE_SECRET_KEY` | Backend Only | Optional | Supabase service-role secret key. Never expose to client. |
| `EVACUATION_MODEL_PATH` | Backend | Optional | Filesystem path to `evacuation_time_rf.joblib`. Defaults to auto-resolving local artifacts. |

---

## Supabase Database Setup & Migrations

### Applying Migrations

The repository contains transactional, idempotent SQL migrations under `supabase/migrations/`:

```bash
# Link project using Supabase CLI
supabase link --project-ref <your-project-ref>

# Apply pending schema migrations
supabase db push
```

Alternatively, apply `supabase/migrations/202610090001_initial_campus_schema.sql` directly using `psql` or the Supabase SQL Editor.

### Seeding Demo Topology

The synthetic campus dataset is maintained in `supabase/seed.sql`:

```bash
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

The seed inserts 2 buildings (Administration and Academic), 4 floors, 21 navigational nodes, 20 graph connections, 3 exits, and 1 assembly point using stable UUIDs and `ON CONFLICT DO NOTHING`.

---

## Automated Testing & Quality Checks

Run the automated test suites prior to commits or releases:

### Backend Tests (pytest)

```bash
cd backend
.venv\Scripts\Activate.ps1
python -m pytest tests/ -v
```

*Note: Database integration tests automatically skip if `SUPABASE_DB_URL` is unconfigured, allowing offline graph unit testing.*

### Frontend Tests (Node.js test runner)

```bash
cd frontend
npm test
```

### Production Build Verification

```bash
cd frontend
npm run build
```

---

## Current Demo Limitations

1. **Synthetic Campus Topology**: The demo campus geometry and node positions are schematic representations intended for demonstration. Physical distances in seed data reflect synthetic models rather than certified architectural survey measurements.
2. **Synthetic Machine Learning Model**: Travel-time predictions are generated by a Random Forest regressor trained on synthetic evacuation formulas. They are illustrative and **not calibrated against real-world evacuation observations or empirical human flow data**.
3. **In-Memory Hazard Injection**: Dynamic hazard scenarios (e.g., blocking fire escape or ground exits) are injected per-request for live testing. They do not persist or mutate permanent incident records in the database.
4. **Sensor Feeds**: Crowd density values and edge congestions are simulated via preset scenario profiles; live IoT camera or turnstile ingestion is not yet integrated.

---

## Production Deployment Prerequisites & Known Blockers

Before deploying Sentinel EvacOS to a public production environment, address the following prerequisites:

1. **Authentication & RBAC (Blocker)**: Route calculation endpoints are currently unauthenticated to facilitate public egress guidance. However, emergency incident reporting, hazard creation, and topology mutation lack administrative authentication and authorization middleware.
2. **Dedicated Backend Container Hosting (Prerequisite)**: The FastAPI backend requires persistent container hosting (e.g., Railway, Render, Google Cloud Run, AWS ECS). It should **not** be deployed as a Vercel serverless function due to Python ML dependencies (`scikit-learn`, `numpy`, `psycopg`) and the 9.5 MB Random Forest artifact size.
3. **Production CORS Configuration (Prerequisite)**: `CORS_ORIGINS` must be explicitly restricted to verified production domains (e.g., `https://campus-safe.vercel.app`) without wildcard origins.
4. **Empirical Calibration (Advisory)**: Deploying the travel-time predictor in life-critical operations requires calibration against real-world building evacuation drills.

---

## Related Documentation

- [Architecture Guide](docs/architecture.md) — Comprehensive service boundaries and data models
- [Database Schema & RLS](docs/database.md) — Table definitions, constraints, indexes, and RLS policies
- [Deployment Guide](docs/deployment.md) — Step-by-step container and Vercel setup
- [API Reference](docs/api.md) — Detailed request and response schemas
