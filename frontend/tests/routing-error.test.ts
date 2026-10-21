import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ApiRequestError,
  parseRoutingError,
} from "../lib/routing-errors.ts";

describe("Routing Error Handling - Classification & Diagnostics", () => {
  it("classifies HTTP 404 'No route connects the requested nodes' as Destination Unreachable", () => {
    const error = new ApiRequestError(
      404,
      "Not Found",
      "No route connects the requested nodes."
    );
    const parsed = parseRoutingError(error);

    assert.equal(parsed.kind, "unreachable");
    assert.equal(parsed.title, "Destination Unreachable");
    assert.equal(
      parsed.message,
      "No valid route exists between the selected nodes under the current access and direction restrictions. Try another destination or select a reachable exit."
    );
  });

  it("classifies standard Error with 'No route' text as Destination Unreachable", () => {
    const error = new Error("No route connects the requested nodes.");
    const parsed = parseRoutingError(error);

    assert.equal(parsed.kind, "unreachable");
    assert.equal(parsed.title, "Destination Unreachable");
    assert.equal(
      parsed.message,
      "No valid route exists between the selected nodes under the current access and direction restrictions. Try another destination or select a reachable exit."
    );
  });

  it("classifies Network / CORS failures (TypeError: Failed to fetch) correctly", () => {
    const browserCorsError = new TypeError("Failed to fetch");
    const parsed = parseRoutingError(browserCorsError);

    assert.equal(parsed.kind, "network");
    assert.equal(parsed.title, "Connection Failed");
    assert.match(parsed.message, /API could not be reached/i);
  });

  it("classifies Node.js fetch failed network errors correctly", () => {
    const nodeFetchError = new TypeError("fetch failed");
    const parsed = parseRoutingError(nodeFetchError);

    assert.equal(parsed.kind, "network");
    assert.equal(parsed.title, "Connection Failed");
    assert.match(parsed.message, /API could not be reached/i);
  });

  it("classifies ApiRequestError with status 0 as network connectivity error", () => {
    const networkApiError = new ApiRequestError(
      0,
      "Network Error",
      "The CAMPUS-SAFE API could not be reached."
    );
    const parsed = parseRoutingError(networkApiError);

    assert.equal(parsed.kind, "network");
    assert.equal(parsed.title, "Connection Failed");
    assert.match(parsed.message, /API could not be reached/i);
  });

  it("classifies HTTP 422 validation errors as Invalid Request", () => {
    const validationError = new ApiRequestError(
      422,
      "Unprocessable Entity",
      "Field required: destination_node_id"
    );
    const parsed = parseRoutingError(validationError);

    assert.equal(parsed.kind, "invalid_request");
    assert.equal(parsed.title, "Invalid Request");
    assert.match(parsed.message, /selected route request is invalid/i);
  });

  it("classifies HTTP 400 bad request errors as Invalid Request", () => {
    const badRequestError = new ApiRequestError(
      400,
      "Bad Request",
      "Invalid node format"
    );
    const parsed = parseRoutingError(badRequestError);

    assert.equal(parsed.kind, "invalid_request");
    assert.equal(parsed.title, "Invalid Request");
    assert.match(parsed.message, /selected route request is invalid/i);
  });

  it("classifies HTTP 500 / 503 internal errors as Server Error", () => {
    const serverError = new ApiRequestError(
      500,
      "Internal Server Error",
      "Database connection timed out"
    );
    const parsed = parseRoutingError(serverError);

    assert.equal(parsed.kind, "server_error");
    assert.equal(parsed.title, "Routing Service Error");
    assert.match(parsed.message, /routing service encountered/i);
  });

  it("preserves original error details for telemetry and debugging", () => {
    const originalDetail = "No route connects the requested nodes.";
    const error = new ApiRequestError(404, "Not Found", originalDetail);
    const parsed = parseRoutingError(error);

    assert.equal(parsed.originalError, originalDetail);
  });

  it("never falsely claims an exit is safe or reachable when unreachable", () => {
    const error = new ApiRequestError(
      404,
      "Not Found",
      "No route connects the requested nodes."
    );
    const parsed = parseRoutingError(error);

    // Must not state that an exit is safe without backend verification
    assert.doesNotMatch(parsed.message, /exit is safe/i);
    assert.doesNotMatch(parsed.message, /exit is reachable/i);
    assert.match(parsed.message, /select a reachable exit/i);
  });

  it("distinguishes HTTP 503 prediction model unavailability from generic server errors", () => {
    const modelError = new ApiRequestError(
      503,
      "Service Unavailable",
      "Travel-time prediction model is unavailable."
    );
    const parsed = parseRoutingError(modelError);

    assert.equal(parsed.kind, "server_error");
    assert.equal(parsed.title, "Prediction Model Unavailable");
    assert.match(parsed.message, /prediction model artifact is not deployed/i);
    assert.match(parsed.message, /standard physical path is retained/i);
  });

  it("distinguishes HTTP 503 temporary service unavailability with retry guidance", () => {
    const serviceError = new ApiRequestError(
      503,
      "Service Unavailable",
      "Service Unavailable"
    );
    const parsed = parseRoutingError(serviceError);

    assert.equal(parsed.kind, "server_error");
    assert.equal(parsed.title, "Service Temporarily Unavailable");
    assert.match(parsed.message, /temporarily unavailable or restarting/i);
  });
});
