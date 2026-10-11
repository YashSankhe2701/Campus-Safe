/**
 * CAMPUS-SAFE shared TypeScript types.
 *
 * Re-exports API types and defines component-level types.
 */

// Re-export API types for convenience
export type {
  HealthResponse,
  DatabaseHealthResponse,
  InfoResponse,
  ApiError,
} from "@/lib/api";

export * from "./routes";

// ---------- Component Types ----------

export type StatusVariant = "operational" | "degraded" | "offline" | "loading";

export interface StatusCardProps {
  title: string;
  status: StatusVariant;
  message?: string;
  details?: string;
}
