# CAMPUS-SAFE

**AI-Based Smart Campus Emergency Management System**

> AI-powered emergency response and dynamic evacuation management for smart campuses.

[![Phase](https://img.shields.io/badge/Phase-2%20Schema%20%26%20Graph-blue)]()
[![Version](https://img.shields.io/badge/Version-0.1.0-green)]()
[![License](https://img.shields.io/badge/License-MIT-yellow)]()

---

## Overview

CAMPUS-SAFE is a web-based intelligent emergency management system for educational campuses. The system will digitally model campuses, calculate safe evacuation routes, predict evacuation times using machine learning, and provide an emergency command dashboard with real-time status updates.

### Current Status: Phase 2 — Database Schema and Campus Graph Foundation

The Supabase PostgreSQL schema, static campus graph, separate emergency-condition records, and synthetic demo campus are implemented through repository-managed SQL. Routing and AI/ML remain future phases.

## Architecture

```
CAMPUS-SAFE User
       │
       ▼
┌──────────────────┐
│  Next.js Frontend │  ← TypeScript, App Router, Tailwind CSS, shadcn/ui
└────────┬─────────┘
         │ API Requests
         ▼
┌──────────────────┐
│  FastAPI Backend   │  ← Python, Pydantic, REST API
│  ┌──────┬───────┐  │
│  │ App  │  AI   │  │
│  │Logic │(future)│  │
│  └──────┴───────┘  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Supabase PostgreSQL│  ← Managed database, Realtime, Auth, Storage
└──────────────────┘
```

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js, TypeScript, App Router, Tailwind CSS, shadcn/ui, Lucide Icons |
| **Backend** | Python, FastAPI, Pydantic |
| **Database** | Supabase PostgreSQL |
| **Deployment** | Vercel (frontend + backend), Supabase (database) |
| **Future AI** | NetworkX, NumPy, Pandas, scikit-learn, A*, Dijkstra |

## Project Structure

```
campus-safe/
├── frontend/              # Next.js application
│   ├── app/               # App Router pages
│   ├── components/        # React components (+ shadcn/ui)
│   ├── lib/               # API client, utilities
│   ├── hooks/             # Custom React hooks
│   └── types/             # TypeScript types
├── backend/               # FastAPI application
│   ├── app/
│   │   ├── main.py        # Entry point
│   │   ├── api/           # Route handlers
│   │   ├── core/          # Config, logging
│   │   ├── models/        # Data models (future)
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # Business logic (future)
│   │   └── database/      # DB connection, repositories
│   └── tests/             # Backend tests
├── supabase/
│   ├── migrations/        # Versioned PostgreSQL schema migrations
│   ├── seed.sql           # Synthetic demo campus
│   └── config.toml        # Supabase CLI project and seed configuration
├── ai/                    # AI/ML modules (future)
│   ├── routing/           # A*, Dijkstra (Phase 3)
│   ├── optimization/      # Route optimization (Phase 6)
│   ├── prediction/        # ML prediction (Phase 7)
│   └── models/            # Trained models (Phase 7)
├── data/                  # Data files (future)
├── simulation/            # Evacuation simulation (future)
├── docs/                  # Documentation
├── tests/                 # Integration tests
├── .env.example           # Environment template
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## Quick Start

### Prerequisites

- **Node.js** 18+
- **Python** 3.11+
- **npm** (comes with Node.js)

### 1. Clone & Configure

```bash
git clone <repository-url>
cd campus-safe
cp .env.example .env
# Edit .env with local configuration
```

### 2. Start the Backend

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

- Backend: **http://localhost:8000**
- API Docs: **http://localhost:8000/docs**

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

- Frontend: **http://localhost:3000**

## Supabase Setup

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Go to **Project Settings → API** for URL and keys
3. Go to **Connect → Connection String → Transaction pooler** for the backend PostgreSQL URI
4. Add values to your `.env` file

### Apply Schema and Seed

With the Supabase CLI installed and the project linked, apply the versioned migration:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Apply the synthetic demo records separately using the Supabase SQL Editor or `psql -f supabase/seed.sql`. For a local Supabase stack, `supabase db reset` applies migrations and the configured seed. See [docs/database.md](docs/database.md) for details.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Backend URL (default: `http://localhost:8000`) |
| `ENVIRONMENT` | Yes | `development` or `production` |
| `CORS_ORIGINS` | Yes | Allowed frontend origins |
| `SUPABASE_URL` | No* | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | No* | Supabase public/client key |
| `SUPABASE_SECRET_KEY` | No* | Supabase privileged key (**backend only**) |
| `SUPABASE_JWKS_URL` | No* | JWT verification metadata URL; not a database URL |
| `SUPABASE_DB_URL` | Yes for database operations | Backend-only PostgreSQL connection string |

\* Supabase API keys are not required for schema storage operations; the direct PostgreSQL URL is required to apply migrations and run live database tests.

> **Security**: Never expose `SUPABASE_SECRET_KEY` or `SUPABASE_DB_URL` to the frontend. The data path is Next.js → FastAPI → PostgreSQL; the frontend only uses `NEXT_PUBLIC_API_URL` to call the backend.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Application health (DB-independent) |
| `GET` | `/api/health/database` | Database connectivity check |
| `GET` | `/api/info` | Project metadata |

## Running Tests

```bash
cd backend
python -m pytest tests/ -v
```

## Deployment (Vercel)

The project is structured for Vercel deployment:

1. Connect your GitHub repository to Vercel
2. Configure the frontend with root directory `frontend/`
3. Set environment variables in Vercel dashboard
4. Backend deployment will be configured in Phase 12

See [docs/deployment.md](docs/deployment.md) for full details.

## Current Limitations

- No routing or route-calculation algorithms are implemented yet
- No AI/ML algorithms implemented
- No authentication system
- No real-time features
- Backend not yet deployed to Vercel

## Development Roadmap

| Phase | Module | Status |
|---|---|---|
| 1 | Foundation (Next.js + FastAPI + Supabase) | ✅ Complete |
| 2 | Database Schema + Campus Graph Foundation | ✅ Complete |
| 3 | Dijkstra + A* Pathfinding | 🔲 Planned |
| 4 | Dynamic Emergency Model | 🔲 Planned |
| 5 | Crowd & Congestion Model | 🔲 Planned |
| 6 | Exit Optimization | 🔲 Planned |
| 7 | ML Evacuation Prediction | 🔲 Planned |
| 8 | Interactive Campus Map | 🔲 Planned |
| 9 | Evacuation Simulation | 🔲 Planned |
| 10 | Realtime Dashboard | 🔲 Planned |
| 11 | Authentication | 🔲 Planned |
| 12 | Production Deployment | 🔲 Planned |

## Documentation

- [Architecture](docs/architecture.md) — System design and data flow
- [Database](docs/database.md) — Implemented schema, graph model, migrations, and synthetic seed
- [Deployment](docs/deployment.md) — Vercel + Supabase deployment guide
- [Development](docs/development.md) — Local development setup
- [API Reference](docs/api.md) — Endpoint documentation
