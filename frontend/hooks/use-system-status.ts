/**
 * Custom hook for fetching backend and database health status.
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { getHealth, getDatabaseHealth, getInfo } from "@/lib/api";
import type {
  HealthResponse,
  DatabaseHealthResponse,
  InfoResponse,
} from "@/lib/api";
import type { StatusVariant } from "@/types";

interface SystemStatus {
  backend: {
    status: StatusVariant;
    data: HealthResponse | null;
    error: string | null;
  };
  database: {
    status: StatusVariant;
    data: DatabaseHealthResponse | null;
    error: string | null;
  };
  info: InfoResponse | null;
}

const INITIAL_STATUS: SystemStatus = {
  backend: { status: "loading", data: null, error: null },
  database: { status: "loading", data: null, error: null },
  info: null,
};

export function useSystemStatus() {
  const [systemStatus, setSystemStatus] =
    useState<SystemStatus>(INITIAL_STATUS);

  const refresh = useCallback(async () => {
    setSystemStatus((prev) => ({
      ...prev,
      backend: { ...prev.backend, status: "loading" },
      database: { ...prev.database, status: "loading" },
    }));

    // Fetch backend health
    try {
      const health = await getHealth();
      setSystemStatus((prev) => ({
        ...prev,
        backend: {
          status: health.status === "ok" ? "operational" : "degraded",
          data: health,
          error: null,
        },
      }));
    } catch (err) {
      setSystemStatus((prev) => ({
        ...prev,
        backend: {
          status: "offline",
          data: null,
          error: err instanceof Error ? err.message : "Connection failed",
        },
      }));
    }

    // Fetch database health
    try {
      const dbHealth = await getDatabaseHealth();
      let dbStatus: StatusVariant = "offline";
      if (dbHealth.status === "ok") dbStatus = "operational";
      else if (dbHealth.status === "not_configured") dbStatus = "degraded";
      else dbStatus = "offline";

      setSystemStatus((prev) => ({
        ...prev,
        database: {
          status: dbStatus,
          data: dbHealth,
          error: null,
        },
      }));
    } catch (err) {
      setSystemStatus((prev) => ({
        ...prev,
        database: {
          status: "offline",
          data: null,
          error: err instanceof Error ? err.message : "Connection failed",
        },
      }));
    }

    // Fetch project info
    try {
      const info = await getInfo();
      setSystemStatus((prev) => ({ ...prev, info }));
    } catch {
      // Info failure is non-critical
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...systemStatus, refresh };
}
