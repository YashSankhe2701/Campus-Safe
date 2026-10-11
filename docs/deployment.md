# CAMPUS-SAFE Deployment Guide

> **Phase: 6.5 — Deployment and Version-Control Foundation**

## Target Deployment Architecture

```
GitHub Repository
       │
       ├── Push to main
       │
       ├──► Vercel (Frontend)
       │    └── Next.js 16 (TypeScript, Tailwind CSS, SVG Map)
       │         ▲
       │         │ HTTPS REST API requests (CORS enabled)
       │         ▼
       └──► Container Host: Railway / Render / Cloud Run (Backend)
            └── Docker: FastAPI (Python 3.11, Uvicorn, NetworkX, scikit-learn)
                 │
                 │ PostgreSQL connection (Transaction pooler)
                 ▼
            Supabase Managed PostgreSQL
            └── Campuses, Buildings, Floors, Graph Nodes, Graph Edges, Exits
```

Do not deploy the Python backend directly on Vercel Serverless Functions. The Python runtime dependencies (`scikit-learn`, `numpy`, `scipy`, `psycopg`) and the 9.5 MB Random Forest artifact exceed serverless memory and bundle size efficiency guidelines. The backend is container-native and should be hosted on a persistent container platform.

---

## Required Environment Variables

Configure environment variables in provider dashboards by name. **Never commit secret keys or database connection strings to version control.**

### Frontend Environment Variables (Vercel)

| Variable Name | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **Yes (Production)** | Fully-qualified HTTPS URL of the deployed FastAPI backend (e.g. `https://api.yourdomain.com`). Next.js production builds validate this variable. |
| `NEXT_PUBLIC_CAMPUS_ID` | Optional | Default campus UUID. Defaults to demo campus `10000000-0000-4000-8000-000000000001` if omitted. |

### Backend Environment Variables (Container Host)

| Variable Name | Required | Description |
|---|---|---|
| `ENVIRONMENT` | Yes | Set to `production` in live environments, `development` locally. |
| `PORT` | Yes | Port uvicorn binds to. Injected automatically by most container hosts (defaults to `8000`). |
| `CORS_ORIGINS` | Yes | Comma-separated list of allowed frontend origins (e.g. `https://campus-safe.vercel.app,https://yourdomain.com`). |
| `SUPABASE_DB_URL` | Yes | PostgreSQL connection URI for the Supabase database. Use the **Transaction Pooler** URI (port 6543) for serverless-compatible connection reuse. |
| `SUPABASE_URL` | Optional | Supabase Project API URL. |
| `SUPABASE_PUBLISHABLE_KEY` | Optional | Public anonymous API key. |
| `SUPABASE_SECRET_KEY` | Optional | Supabase service-role secret key. **Never expose to frontend.** |
| `EVACUATION_MODEL_PATH` | Optional | Filesystem path to `evacuation_time_rf.joblib`. Defaults to `/app/artifacts/evacuation_time_rf.joblib` in Docker. |

---

## Deployment Sequence

Follow this sequence to ensure zero-downtime and clean dependency resolution:

### Step 1: Database Setup (Supabase)
1. In Supabase Dashboard, create or link your project.
2. Apply the versioned migration:
   ```bash
   supabase db push
   # or execute supabase/migrations/202610090001_initial_campus_schema.sql via SQL Editor
   ```
3. Seed the synthetic demo campus:
   ```bash
   # Execute supabase/seed.sql via SQL Editor
   ```
4. Copy the **Transaction Pooler** connection string (port 6543) from **Database Settings → Connection Pooling**.

### Step 2: Backend Container Deployment (Railway / Render / Cloud Run)
1. Create a new service from the repository.
2. Set the build type to **Dockerfile** (pointing to `backend/Dockerfile`).
3. Set environment variables:
   - `ENVIRONMENT=production`
   - `CORS_ORIGINS=https://your-frontend-app.vercel.app` (or temporary wildcard during initial setup)
   - `SUPABASE_DB_URL=<transaction-pooler-uri>`
   - `EVACUATION_MODEL_PATH=/app/artifacts/evacuation_time_rf.joblib`
4. Ensure the model artifact `evacuation_time_rf.joblib` is baked into the image or mounted via a persistent volume / pre-deploy script.
5. Deploy and observe container health check logs.

### Step 3: Backend Health Verification
Verify backend operational status before connecting the frontend:
- `GET https://<your-backend-domain>/api/health` $\to$ Returns `{"status":"ok","service":"campus-safe-api","version":"0.1.0"}`
- `GET https://<your-backend-domain>/api/health/database` $\to$ Returns `{"status":"ok","database":"supabase"}`
- `GET https://<your-backend-domain>/api/info` $\to$ Returns project info metadata.
- `GET https://<your-backend-domain>/api/campuses/10000000-0000-4000-8000-000000000001/graph` $\to$ Returns graph summary counts.

### Step 4: Frontend Deployment (Vercel)
1. In Vercel, import the repository.
2. Set **Root Directory** to `frontend/`.
3. Set **Framework Preset** to `Next.js`.
4. Configure environment variable:
   - `NEXT_PUBLIC_API_URL=https://<your-backend-domain>`
5. Trigger deployment. The Next.js production build will compile and statically optimize all pages.
6. Copy the assigned Vercel production domain (e.g. `https://campus-safe.vercel.app`).

### Step 5: Update Backend CORS
Update the backend container environment variable:
- `CORS_ORIGINS=https://campus-safe.vercel.app`
Restart or redeploy the backend service so browser preflight `OPTIONS` requests succeed.

---

## ML Model Artifact Availability

The Random Forest model file (`evacuation_time_rf.joblib`) is approximately 9.5 MB and is excluded from Git tracking via `.gitignore`.

For production deployment:
1. **Container Baking (Recommended)**: Build the container image in an environment where `ai/prediction/artifacts/evacuation_time_rf.joblib` is present, copying it to `/app/artifacts/evacuation_time_rf.joblib`.
2. **Pre-build Generation**: If building in a fresh CI environment without pre-existing artifacts, run the deterministic experiment script prior to image packaging:
   ```bash
   python ai/prediction/train_experiment.py
   ```
3. **Volume Mount**: Mount a volume containing the model artifact and set `EVACUATION_MODEL_PATH` to the mounted file path.

---

## Health Check and Monitoring

- **Application Health**: `GET /api/health` responds independently of database connectivity.
- **Database Health**: `GET /api/health/database` verifies PostgreSQL connectivity and returns sanitized status (`ok`, `not_configured`, or `error`).
- **Interactive Map**: In the frontend, the campus visualizer renders schematic topology offline and displays clear error notifications if backend APIs are temporarily unreachable.

---

## Local Development and Rollback

### Running Locally
```powershell
# Backend
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm run dev
```

### Rollbacks
- **Frontend**: In the Vercel dashboard, navigate to **Deployments**, locate the last healthy deployment, and select **Promote to Production**.
- **Backend**: In your container host dashboard (e.g. Railway/Render), select the previous image tag or rollback to the prior release.
