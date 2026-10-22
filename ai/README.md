# Sentinel EvacOS — AI Module

> **Status: Phase 5 synthetic route-time experiment implemented; no real-world model validation**

This directory will contain the AI and machine-learning components for Sentinel EvacOS.

## Planned Sub-modules

| Directory | Purpose | Phase |
|---|---|---|
| `routing/` | A*, Dijkstra, shortest-path algorithms | Phase 3 |
| `optimization/` | Exit optimization, crowd-aware routing | Phase 6 |
| `prediction/` | Synthetic per-route travel-time experiment and Random Forest artifact | Phase 5 |
| `models/` | Trained model artifacts | Phase 7 |

## Technologies (Future)

- NetworkX — graph representation
- NumPy / Pandas — numerical processing
- scikit-learn — synthetic Random Forest experiment
- A* / Dijkstra — pathfinding algorithms

## Architecture

```
FastAPI Backend
    ↓
AI Service Layer
    ↓
┌─────────────┬──────────────┬───────────────┐
│  routing/   │ optimization/│  prediction/  │
│  A*, Dijkstra│ exit scoring │  ML models    │
└─────────────┴──────────────┴───────────────┘
```

The Phase 5 prediction experiment is trained only on reproducible synthetic scenarios generated from the Phase 4 formula. Its metrics do not establish real-world evacuation-time accuracy. See `docs/ml.md` for its target, feature schema, evaluation metrics, artifact workflow, and limitations. Do not use it as a safe-route or real emergency clearance predictor.
