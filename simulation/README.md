# Sentinel EvacOS — Simulation Module

> **Status: NOT IMPLEMENTED YET**

This directory will contain evacuation simulation logic.

## Planned Capabilities

- Agent-based evacuation simulation
- Crowd-flow modeling
- Bottleneck detection
- Visual playback of evacuation scenarios

## Phase

Simulation will be implemented in **Phase 9**.

## Architecture Notes

- Simulations must be compatible with **serverless deployment** (Vercel).
- Long-running simulations should be designed so the browser or an appropriate
  server-side mechanism handles them safely.
- Persistent simulation state should live in **Supabase**, not process memory.
- Do NOT create infinite loops, daemon processes, or permanent WebSocket servers.
