# Sentinel EvacOS — Data Directory

> **Status: NOT IMPLEMENTED YET**

This directory stores campus data and ML training datasets.

## Structure

| Directory | Purpose | Phase |
|---|---|---|
| `campus/` | Campus graph definitions (buildings, rooms, corridors, exits) | Phase 2 |
| `training/` | ML training datasets for evacuation prediction | Phase 7 |

## Notes

- Campus data will be stored as structured JSON or loaded from Supabase.
- Training data will be generated via simulation in Phase 7.
- Uploaded files should eventually use **Supabase Storage**, not local filesystem.
