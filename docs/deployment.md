# Sentinel EvacOS Production Deployment Guide

> **Deployment Targets**:
> - **Frontend**: Vercel (Next.js 15 / 16 App Router)
> - **Backend**: Container-native FastAPI service (Railway, Render, AWS ECS, or Google Cloud Run via `backend/Dockerfile`)
> - **Database**: Supabase PostgreSQL (Managed Transaction Pooler with Row-Level Security)

---

## 1. Architecture Overview

```
                      ┌──────────────────────────────────────┐
                      │              End User                │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │           Vercel Platform            │
                      │   - Framework: Next.js App Router    │
                      │   - Root Directory: frontend/        │
                      │   - Static Optimization & SVG Canvas │
                      └──────────────────┬───────────────────┘
                                         │
                                         │ HTTPS Requests (CORS Enabled)
                                         ▼
                      ┌──────────────────────────────────────┐
                      │       Backend Container Host         │
                      │  (Railway / Render / Cloud Run / ECS)│
                      │   - Docker: python:3.11-slim         │
                      │   - ASGI: Uvicorn with proxy headers │
                      │   - In-Memory NetworkX Graph Engine  │
                      │   - Scikit-Learn Travel-Time Model   │
                      └──────────────────┬───────────────────┘
                                         │
                                         │ Serverless-Friendly Pooling (psycopg)
                                         ▼
                      ┌──────────────────────────────────────┐
                      │          Supabase PostgreSQL         │
                      │   - Transaction Pooler (Port 6543)   │
                      │   - 12 Tables with RLS Default-Deny  │
                      │   - Authoritative Synthetic Topology │
                      └──────────────────────────────────────┘
```

> [!IMPORTANT]
> **Do not deploy the FastAPI backend to Vercel Serverless Functions.**
> Python data science libraries (`scikit-learn`, `numpy`, `scipy`, `psycopg`) and the 9.5 MB Random Forest model artifact exceed serverless function memory and bundle constraints. Deploy the backend to a persistent container service using the repository's `backend/Dockerfile`.

---

## 2. Vercel Frontend Configuration

### Project Settings
When importing the repository into the Vercel Dashboard:
- **Project Name**: `campus-safe` (or preferred name)
- **Framework Preset**: `Next.js`
- **Root Directory**: `frontend` (Click *Edit* and select `frontend`)
- **Build Command**: `npm run build` (or Next.js default `next build`)
- **Output Directory**: `.next` (Next.js default)
- **Install Command**: `npm install`

### Compile-Time API Validation
The frontend's `frontend/next.config.ts` enforces production configuration:
```ts
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error("Missing required environment variable: NEXT_PUBLIC_API_URL.");
}
```
If `NEXT_PUBLIC_API_URL` is omitted from Vercel's Environment Variables, the build will fail immediately with a clear error rather than deploying a broken application pointing to `localhost`.

### Browser Credential Isolation
The frontend communicates exclusively with the backend via `NEXT_PUBLIC_API_URL`. **No database credentials, service-role keys, or backend secrets are ever provided to or exposed in the frontend.**

---

## 3. FastAPI Backend Container Deployment

### Docker Build & Runtime Specification
The backend container is defined in `backend/Dockerfile`:
- **Base Image**: `python:3.11-slim`
- **Working Directory**: `/app`
- **Port Binding**: Binds to `0.0.0.0` using the platform-injected `${PORT}` environment variable (defaults to `8000`).
- **ASGI Server**: `uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers`
- **Healthcheck**: `curl -f http://localhost:${PORT}/api/health || exit 1`
- **Security**: Runs non-root dependencies; `.dockerignore` excludes virtualenvs, test suites, `.git`, and `.env` files.

### ML Artifact Delivery & Fallback Behavior
The Random Forest model file (`evacuation_time_rf.joblib`, ~9.5 MB) is gitignored to keep the repository lightweight.

1. **Pre-Build Staging (Recommended)**:
   Prior to packaging the container image, run the staging script to copy the model from `ai/prediction/artifacts` to `backend/artifacts`:
   ```bash
   python backend/scripts/prepare_artifacts.py
   ```
2. **Deterministic Regeneration (CI/CD)**:
   In a headless CI runner where local artifacts are absent, regenerate the artifact deterministically:
   ```bash
   python ai/prediction/train_experiment.py
   python backend/scripts/prepare_artifacts.py
   ```
3. **Graceful Fallback**:
   The `backend/artifacts/.gitkeep` file ensures the build context never errors if the `.joblib` binary is missing. If the artifact is omitted:
   - All graph routing endpoints (Dijkstra, A*, Emergency Avoidance, Exit Selection, Congestion) function completely normally.
   - Only the ML route-time prediction endpoint (`POST /api/campuses/{id}/routes/predicted-time`) returns `503 Service Unavailable: Travel-time prediction model is unavailable.` without crashing the application.

---

## 4. Supabase PostgreSQL Migration Procedure

### Safe, Non-Destructive Schema Updates
The database migrations under `supabase/migrations/` are strictly additive and idempotent:
1. `202610090001_initial_campus_schema.sql` (Tables, constraints, indexes, triggers, and RLS enable statements)
2. `202610110001_add_walkway_academic_edge.sql` (Authoritative walkway edge addition)

> [!CAUTION]
> **Never run `supabase db reset` against a live or shared project.**
> `db reset` drops all tables and cascades data loss. Always use non-destructive migration commands.

### Migration Execution

#### Option A: Supabase CLI (Recommended)
```bash
# Link repository to existing project
supabase link --project-ref <your-project-ref>

# Push pending idempotent migrations
supabase db push
```

#### Option B: Supabase Dashboard SQL Editor
1. Open the [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to **SQL Editor**.
3. Open `supabase/migrations/202610090001_initial_campus_schema.sql` and run the script.
4. Open `supabase/migrations/202610110001_add_walkway_academic_edge.sql` and run the script.

#### Optional Demo Topology Seeding
To populate the 21-node synthetic demonstration campus:
```bash
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```
*Note: `supabase/seed.sql` uses `ON CONFLICT DO NOTHING` and will not overwrite modified rows.*

---

## 5. Production Environment Checklist

### A. Vercel Frontend Configuration (Project Settings → Environment Variables)

| Variable Name | Type | Scope | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Public (Client) | Production, Preview | Fully-qualified HTTPS URL of the deployed FastAPI backend (e.g. `https://api.campus-safe.example.com`). Required for build. |
| `NEXT_PUBLIC_CAMPUS_ID` | Public (Client) | Production, Preview | (Optional) Campus UUID. Defaults to demo campus `10000000-0000-4000-8000-000000000001`. |

### B. Backend Hosting Configuration (Railway / Render / Cloud Run / ECS)

| Variable Name | Type | Scope | Description |
|---|---|---|---|
| `ENVIRONMENT` | String | Container | Set to `production`. |
| `PORT` | Number | Container | Injected automatically by host (default `8000`). |
| `CORS_ORIGINS` | Secret/Config | Container | Comma-delimited list of allowed frontend domains without trailing slash (e.g. `https://campus-safe.vercel.app`). Wildcards are rejected. |
| `SUPABASE_DB_URL` | **Secret** | Backend Only | PostgreSQL connection URI from Supabase (**Transaction Pooler, port 6543**). Example: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`. |
| `SUPABASE_URL` | Config | Backend Only | (Optional) Supabase Project API URL (`https://[ref].supabase.co`). |
| `SUPABASE_PUBLISHABLE_KEY` | Public Key | Backend Only | (Optional) Supabase anonymous/publishable key. |
| `SUPABASE_SECRET_KEY` | **Secret** | Backend Only | (Optional) Supabase service-role secret key. |
| `EVACUATION_MODEL_PATH` | Path | Container | (Optional) Path to model artifact. Defaults to `/app/artifacts/evacuation_time_rf.joblib`. |

### C. Local Development Configuration (`.env`)

| Variable Name | Value | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Points frontend to local backend. |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:3001` | Allows local Next.js ports. |
| `ENVIRONMENT` | `development` | Enables local debug logs. |
| `SUPABASE_DB_URL` | Direct or pooler URI | Used for local testing against Supabase. |

---

## 6. Post-Deployment Verification & Smoke Tests

Execute these validation commands against the live deployment:

### 1. Backend Process Liveness Check
```bash
curl -f https://<your-backend-domain>/api/health
```
**Expected Response**: `200 OK`
```json
{"status":"ok","service":"sentinel-evacos-api","version":"0.1.0"}
```

### 2. Database Connectivity Readiness Check
```bash
curl -f https://<your-backend-domain>/api/health/database
```
**Expected Response**: `200 OK`
```json
{"status":"ok","database":"supabase"}
```

### 3. Public Metadata Probe
```bash
curl -f https://<your-backend-domain>/api/info
```
**Expected Response**: `200 OK`
```json
{"project":"Sentinel EvacOS","version":"0.1.0","environment":"production","api_status":"operational"}
```

### 4. Graph Topology Retrieval
```bash
curl -f https://<your-backend-domain>/api/campuses/10000000-0000-4000-8000-000000000001/graph
```
**Expected Response**: `200 OK` with `node_count >= 21` and `edge_count >= 21`.

### 5. Dynamic Evacuation Route Calculation
```bash
curl -X POST https://<your-backend-domain>/api/campuses/10000000-0000-4000-8000-000000000001/routes/evacuation \
  -H "Content-Type: application/json" \
  -d '{"start_node_id": "20000000-0000-4000-8000-000000000009", "blocked_edge_ids": []}'
```
**Expected Response**: `200 OK` with `status: "route_found"`, `selected_exit_name: "Administration First Floor Fire Escape"`, and `total_distance_m: 17.0`.

### 6. Frontend Browser Smoke Test
1. Navigate to `https://<your-vercel-domain>`.
2. Verify the top banner displays: `Authoritative Schematic Topology & Model Governance`.
3. Verify the SVG campus map renders nodes, edges, and buildings.
4. Select *Hazard Simulation: 1st Floor Fire Escape Blocked*. Click **Calculate Route**.
5. Verify physical distance updates to **33.0 m** (*Administration West Emergency Exit*).
6. Select *Hazard Simulation: All Administration Exits Blocked*. Click **Calculate Route**.
7. Verify distance updates to **—** and status badge displays **NO EXIT REACHABLE**.

---

## 7. Rollback Procedures

### Frontend (Vercel)
1. Open the **Deployments** tab in the Vercel project dashboard.
2. Locate the previous successful deployment.
3. Click the three dots (`...`) and select **Instant Rollback** (or **Promote to Production**).
4. Vercel routes traffic immediately to the previous immutable deployment bundle.

### Backend (Container Platform)
1. In your container dashboard (Railway / Render / Cloud Run / AWS ECS), navigate to **Deployments** or **Revisions**.
2. Select the prior stable image tag or revision.
3. Click **Rollback / Redeploy Revision**.
4. The load balancer shifts traffic to healthy containers running the prior build.

### Database (Supabase)
Because migrations are non-destructive and idempotent (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`), application rollbacks remain compatible with the database schema without rolling back DDL.

---

## 8. Deployment Prerequisites & Blockers

| Item | Status | Action Required |
|---|---|---|
| **Vercel Account & Import** | Pending User | User must import repository and set Root Directory to `frontend`. |
| **Backend Container Host** | Pending User | User must provision Railway, Render, or Cloud Run service pointing to `backend/Dockerfile`. |
| **Environment Variables** | Pending User | User must set `NEXT_PUBLIC_API_URL`, `SUPABASE_DB_URL`, and `CORS_ORIGINS` in respective dashboards. |
| **ML Model Artifact** | Configured | Staged via `prepare_artifacts.py` or generated via `train_experiment.py`. Graceful fallback active. |
| **Authentication on Mutations** | Roadmap | Read-only routing is production-ready; mutation APIs will require RBAC in subsequent phases. |
