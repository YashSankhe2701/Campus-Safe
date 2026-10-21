/**
 * Routing error classification and user-friendly diagnostics for CAMPUS-SAFE.
 */

export type RouteErrorKind =
  | "unreachable"
  | "network"
  | "invalid_request"
  | "server_error"
  | "generic";

export interface RouteErrorInfo {
  kind: RouteErrorKind;
  title: string;
  message: string;
  originalError?: string;
}

export class ApiRequestError extends Error {
  public status: number;
  public statusText: string;
  public detail: string;

  constructor(status: number, statusText: string, detail: string) {
    super(detail || `HTTP ${status}: ${statusText}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.statusText = statusText;
    this.detail = detail;
  }
}

/**
 * Classifies a caught error into user-friendly routing diagnostics.
 */
export function parseRoutingError(err: unknown): RouteErrorInfo {
  const status = err instanceof ApiRequestError ? err.status : null;
  const rawMessage = err instanceof Error ? err.message : String(err || "");
  const originalError = rawMessage;

  // 1. Network / CORS connectivity failure
  const isNetworkFailure =
    (err instanceof ApiRequestError && err.status === 0) ||
    (err instanceof TypeError &&
      (rawMessage.includes("fetch") ||
        rawMessage.includes("Failed to fetch") ||
        rawMessage.includes("NetworkError") ||
        rawMessage.includes("network"))) ||
    (err instanceof Error &&
      (rawMessage.includes("Failed to fetch") ||
        rawMessage.includes("fetch failed") ||
        rawMessage.includes("NetworkError") ||
        rawMessage.includes("NEXT_PUBLIC_API_URL") ||
        rawMessage.includes("could not be reached") ||
        rawMessage.includes("CORS")));

  if (isNetworkFailure) {
    return {
      kind: "network",
      title: "Connection Failed",
      message:
        "The CAMPUS-SAFE API could not be reached. Please check your network connection or verify that the backend server is running.",
      originalError,
    };
  }

  // 2. Unreachable destination (HTTP 404 No route connects the requested nodes)
  const isUnreachable =
    (status === 404 &&
      (rawMessage.includes("No route") ||
        rawMessage.includes("not found") ||
        rawMessage.includes("unreachable"))) ||
    rawMessage.includes("No route connects the requested nodes") ||
    rawMessage.includes("No route exists") ||
    rawMessage.includes("Destination node was not found") ||
    rawMessage.includes("No route found");

  if (isUnreachable) {
    return {
      kind: "unreachable",
      title: "Destination Unreachable",
      message:
        "No valid route exists between the selected nodes under the current access and direction restrictions. Try another destination or select a reachable exit.",
      originalError,
    };
  }

  // 3. Invalid Request (HTTP 400 or 422 validation error)
  const isInvalidRequest =
    status === 400 ||
    status === 422 ||
    rawMessage.includes("validation") ||
    rawMessage.includes("Field required") ||
    rawMessage.includes("Invalid UUID") ||
    rawMessage.includes("invalid");

  if (isInvalidRequest) {
    return {
      kind: "invalid_request",
      title: "Invalid Request",
      message:
        "The selected route request is invalid. Please verify the selected nodes and parameters.",
      originalError,
    };
  }

  // 4. Server error (HTTP 500, 502, 503, 504)
  if (status !== null && status >= 500) {
    if (
      status === 503 &&
      (rawMessage.includes("model") ||
        rawMessage.includes("prediction") ||
        rawMessage.includes("Travel-time") ||
        rawMessage.includes("artifact"))
    ) {
      return {
        kind: "server_error",
        title: "Prediction Model Unavailable",
        message:
          "The ML travel-time prediction model artifact is not deployed on this server. Standard physical path is retained; switch to Dijkstra or A*.",
        originalError,
      };
    }

    if (status === 503) {
      return {
        kind: "server_error",
        title: "Service Temporarily Unavailable",
        message:
          "The routing backend is temporarily unavailable or restarting (HTTP 503). Please retry in a few seconds.",
        originalError,
      };
    }

    const detailText = rawMessage && !rawMessage.startsWith("HTTP") ? ` (${rawMessage})` : "";
    return {
      kind: "server_error",
      title: "Routing Service Error",
      message:
        `The routing service encountered an unexpected error${detailText}. Please try again shortly or contact system administrators.`,
      originalError,
    };
  }

  // 5. Generic / fallback error
  return {
    kind: "generic",
    title: "Routing Request Failed",
    message: rawMessage || "An unexpected error occurred while calculating the route.",
    originalError,
  };
}
