/**
 * Sentinel EvacOS API client.
 *
 * All backend requests go through this module.
 * Never scatter fetch calls throughout React components.
 */

import {
  CampusGraphSummaryResponse,
  ShortestRouteRequest,
  ShortestRouteResponse,
  EmergencyAwareRouteRequest,
  EmergencyAwareRouteResponse,
  ExitSelectionRequest,
  ExitSelectionResponse,
  CongestionRouteRequest,
  CongestionRouteResponse,
  RouteTimePredictionRequest,
  RouteTimePredictionResponse,
} from "@/types/routes";

import {
  ApiRequestError,
  RouteErrorInfo,
  RouteErrorKind,
  parseRoutingError,
} from "./routing-errors";

export { ApiRequestError, parseRoutingError };
export type { RouteErrorInfo, RouteErrorKind };

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : null);

export const DEFAULT_CAMPUS_ID =
  process.env.NEXT_PUBLIC_CAMPUS_ID || "10000000-0000-4000-8000-000000000001";

// ---------- Types ----------

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

export interface DatabaseHealthResponse {
  status: string;
  database: string;
  message?: string;
}

export interface InfoResponse {
  project: string;
  description: string;
  version: string;
  environment: string;
  api_status: string;
  documentation_url: string;
}

export interface ApiError {
  detail: string;
  status: string;
}

// ---------- Helpers ----------

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

async function apiFetch<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiRequestError(
      0,
      "Configuration Error",
      "NEXT_PUBLIC_API_URL is not configured. In production, configure this environment variable."
    );
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const method = options.method || "GET";

  const fetchInit: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    cache: "no-store",
  };

  if (options.body !== undefined) {
    fetchInit.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(url, fetchInit);
  } catch (err: unknown) {
    if (
      err instanceof TypeError ||
      (err instanceof Error &&
        (err.message.includes("fetch") ||
          err.message.includes("NetworkError") ||
          err.message.includes("Failed to fetch")))
    ) {
      throw new ApiRequestError(
        0,
        "Network Error",
        "The Sentinel EvacOS API could not be reached. Please check your network connection or verify that the backend server is running."
      );
    }
    throw err;
  }

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorBody = await response.json();
      if (errorBody && typeof errorBody.detail === "string") {
        errorDetail = errorBody.detail;
      } else if (errorBody && Array.isArray(errorBody.detail)) {
        // FastAPI validation errors (422)
        errorDetail = errorBody.detail
          .map((d: { msg?: string; loc?: string[] }) => d.msg || JSON.stringify(d))
          .join("; ");
      }
    } catch {
      // Body not JSON; retain standard error text
    }
    throw new ApiRequestError(response.status, response.statusText, errorDetail);
  }

  return response.json() as Promise<T>;
}

// ---------- Foundation API Functions ----------

/**
 * Check backend health.
 * This endpoint works without a database connection.
 */
export async function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/health");
}

/**
 * Check database connectivity.
 */
export async function getDatabaseHealth(): Promise<DatabaseHealthResponse> {
  return apiFetch<DatabaseHealthResponse>("/api/health/database");
}

/**
 * Get project information.
 * Returns project metadata — never contains secrets.
 */
export async function getInfo(): Promise<InfoResponse> {
  return apiFetch<InfoResponse>("/api/info");
}

// ---------- Campus & Graph Endpoints ----------

/**
 * Get campus graph summary metadata from backend.
 * Returns aggregate counts (node_count, edge_count, exit_count, etc.).
 */
export async function getCampusGraph(
  campusId: string = DEFAULT_CAMPUS_ID
): Promise<CampusGraphSummaryResponse> {
  return apiFetch<CampusGraphSummaryResponse>(`/api/campuses/${campusId}/graph`);
}

// ---------- Routing Endpoints ----------

/**
 * Calculate shortest physical distance route using Dijkstra's algorithm.
 */
export async function getShortestRoute(
  campusId: string,
  request: ShortestRouteRequest
): Promise<ShortestRouteResponse> {
  return apiFetch<ShortestRouteResponse>(
    `/api/campuses/${campusId}/routes/shortest`,
    {
      method: "POST",
      body: request,
    }
  );
}

/**
 * Calculate route using A* search with a zero heuristic.
 */
export async function getAstarRoute(
  campusId: string,
  request: ShortestRouteRequest
): Promise<ShortestRouteResponse> {
  return apiFetch<ShortestRouteResponse>(
    `/api/campuses/${campusId}/routes/astar`,
    {
      method: "POST",
      body: request,
    }
  );
}

/**
 * Calculate emergency-aware route that avoids active/current blockages.
 */
export async function getEmergencyAwareRoute(
  campusId: string,
  request: EmergencyAwareRouteRequest
): Promise<EmergencyAwareRouteResponse> {
  return apiFetch<EmergencyAwareRouteResponse>(
    `/api/campuses/${campusId}/routes/emergency-aware`,
    {
      method: "POST",
      body: request,
    }
  );
}

/**
 * Evaluate all eligible exits and select the nearest reachable active exit.
 */
export async function getEvacuationRoute(
  campusId: string,
  request: ExitSelectionRequest
): Promise<ExitSelectionResponse> {
  return apiFetch<ExitSelectionResponse>(
    `/api/campuses/${campusId}/routes/evacuation`,
    {
      method: "POST",
      body: request,
    }
  );
}

/**
 * Calculate scenario-based crowd and congestion route.
 */
export async function getCongestionRoute(
  campusId: string,
  request: CongestionRouteRequest
): Promise<CongestionRouteResponse> {
  return apiFetch<CongestionRouteResponse>(
    `/api/campuses/${campusId}/routes/congestion-scenario`,
    {
      method: "POST",
      body: request,
    }
  );
}

/**
 * Predict travel time along a specified route using synthetic ML model.
 */
export async function predictRouteTime(
  campusId: string,
  request: RouteTimePredictionRequest
): Promise<RouteTimePredictionResponse> {
  return apiFetch<RouteTimePredictionResponse>(
    `/api/campuses/${campusId}/routes/predicted-time`,
    {
      method: "POST",
      body: request,
    }
  );
}
