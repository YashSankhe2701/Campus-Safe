import { UUID } from "crypto";

export type NodeId = string;
export type EdgeId = string;
export type CampusId = string;

export type NodeType =
  | "entrance"
  | "exit"
  | "corridor"
  | "junction"
  | "room"
  | "staircase"
  | "elevator"
  | "assembly_point";

export type EdgeType =
  | "hallway"
  | "door"
  | "staircase"
  | "elevator"
  | "ramp"
  | "outdoor"
  | "other";

export interface CampusGraphSummaryResponse {
  campus_id: string;
  campus_name: string | null;
  graph_type: string;
  node_count: number;
  edge_count: number;
  arc_count: number;
  exit_count: number;
  assembly_point_count: number;
  node_type_counts: Record<string, number>;
  directed_edge_count: number;
  bidirectional_edge_count: number;
}

export interface RouteStep {
  from_node_id: string;
  to_node_id: string;
  edge_id: string;
  distance_m: number;
}

export interface ShortestRouteRequest {
  start_node_id: string;
  destination_node_id: string;
  blocked_edge_ids?: string[];
  blocked_node_ids?: string[];
}

export interface ShortestRouteResponse {
  campus_id: string;
  start_node_id: string;
  destination_node_id: string;
  path_node_ids: string[];
  total_distance_m: number;
  steps: RouteStep[];
}

export interface EmergencyAwareRouteRequest extends ShortestRouteRequest {
  blocked_edge_ids?: string[];
  blocked_node_ids?: string[];
}

export interface EmergencyAwareRouteResponse extends ShortestRouteResponse {
  active_emergency_ids: string[];
  blocked_edge_count: number;
  blocked_node_count: number;
  risk_weighting_applied: boolean;
  risk_weighting_status: string;
}

export interface ExitSelectionRequest {
  start_node_id: string;
  blocked_edge_ids?: string[];
  blocked_node_ids?: string[];
}

export interface EvaluatedExit {
  exit_id: string;
  node_id: string;
  name: string;
  exit_type: string;
  reachable: boolean;
  distance_m: number | null;
  exclusion_reason: "inactive" | "blocked" | "unreachable" | null;
}

export interface ExitSelectionResponse {
  status: "route_found" | "no_route";
  campus_id: string;
  start_node_id: string;
  selected_exit_id: string | null;
  selected_exit_node_id: string | null;
  selected_exit_name: string | null;
  selected_exit_type: string | null;
  path_node_ids: string[];
  total_distance_m: number | null;
  steps: RouteStep[];
  active_emergency_ids: string[];
  evaluated_exits: EvaluatedExit[];
  blocked_edge_count?: number;
  blocked_node_count?: number;
  selection_objective: string;
  safety_notice: string;
}

export interface EdgeCrowdScenario {
  edge_id: string;
  occupancy_people: number;
  capacity_people: number;
  observed_at?: string;
}

export interface CongestionRouteRequest {
  start_node_id: string;
  destination_node_id: string;
  base_walking_speed_mps: number;
  edge_scenarios?: EdgeCrowdScenario[];
}

export interface CongestionRouteStep {
  from_node_id: string;
  to_node_id: string;
  edge_id: string;
  distance_m: number;
  estimated_travel_time_s: number;
  density_ratio: number | null;
  congestion_score: number | null;
  measurement_status: "valid" | "missing" | "missing_timestamp" | "stale";
  over_capacity: boolean;
}

export interface CongestionRouteResponse {
  campus_id: string;
  start_node_id: string;
  destination_node_id: string;
  path_node_ids: string[];
  total_distance_m: number;
  estimated_travel_time_s: number;
  steps: CongestionRouteStep[];
  data_mode: "explicit_scenario_inputs";
  live_crowd_measurements_used: false;
  unknown_measurement_edge_count: number;
}

export interface RouteTimePredictionRequest {
  path_node_ids: string[];
  edge_ids: string[];
  base_walking_speed_mps: number;
  edge_scenarios?: EdgeCrowdScenario[];
}

export interface EdgeMeasurementStatus {
  edge_id: string;
  measurement_status: "valid" | "missing" | "missing_timestamp" | "stale";
  density_ratio: number | null;
  congestion_score: number | null;
}

export interface RouteTimePredictionResponse {
  predicted_travel_time_s: number;
  route_distance_m: number;
  path_node_ids: string[];
  edge_ids: string[];
  model_version: string;
  training_data_type: string;
  input_data_mode: string;
  live_crowd_measurements_used: false;
  features: Record<string, number>;
  edge_measurement_statuses: EdgeMeasurementStatus[];
  validation_limitation: string;
}

// Topology types
export interface GraphNodeDefinition {
  id: string;
  name: string;
  code: string;
  node_type: NodeType;
  floor_id: string | null;
  building_id: string | null;
  floor_name: string;
  building_name: string;
  x: number;
  y: number;
  capacity: number;
  is_exit: boolean;
  is_assembly_point: boolean;
}

export interface GraphEdgeDefinition {
  id: string;
  from_node_id: string;
  to_node_id: string;
  distance: number;
  base_capacity: number;
  base_speed: number;
  bidirectional: boolean;
  edge_type: EdgeType;
}

export type RoutingStrategy =
  | "shortest"
  | "astar"
  | "emergency"
  | "evacuation"
  | "congestion"
  | "prediction";
