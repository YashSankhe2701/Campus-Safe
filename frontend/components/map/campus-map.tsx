"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  DEMO_CAMPUS_ID,
  DEMO_CAMPUS_NAME,
  DEMO_NODES,
  DEMO_EDGES,
  DEMO_EXITS,
  DEMO_ASSEMBLY_POINTS,
  DEMO_BUILDINGS,
  DEMO_FLOORS,
  getNodeById,
  findEdgeBetween,
} from "@/lib/demo-campus";
import {
  getCampusGraph,
  getShortestRoute,
  getAstarRoute,
  getEmergencyAwareRoute,
  getEvacuationRoute,
  getCongestionRoute,
  predictRouteTime,
  parseRoutingError,
  RouteErrorInfo,
} from "@/lib/api";
import {
  RoutingStrategy,
  CampusGraphSummaryResponse,
  ShortestRouteResponse,
  EmergencyAwareRouteResponse,
  ExitSelectionResponse,
  CongestionRouteResponse,
  RouteTimePredictionResponse,
  GraphNodeDefinition,
  GraphEdgeDefinition,
  EdgeCrowdScenario,
} from "@/types/routes";
import {
  Navigation,
  Shield,
  AlertTriangle,
  Clock,
  Layers,
  Info,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Copy,
  Check,
  History,
  Route as RouteIcon,
  Zap,
  MapPin,
  Crosshair,
  Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

import {
  FloorFilter,
  LabelBox,
  getCompactNodeLabel,
  getNodeRadius,
  computeAllLabelPositions,
  transformCoordinates as getPresentationCoordinates,
  CAMPUS_VIEWBOX,
} from "@/lib/map-layout";

export interface RouteHistoryItem {
  id: string;
  timestamp: string;
  startNodeId: string;
  destinationNodeId: string;
  strategy: RoutingStrategy;
  hazardPreset: "none" | "fire_escape" | "ground_exit" | "all_admin_exits";
  distance: number | null;
  nodeCount: number;
}

export function CampusMap() {
  // Campus and topology state
  const [campusId, setCampusId] = useState<string>(DEMO_CAMPUS_ID);
  const [graphSummary, setGraphSummary] = useState<CampusGraphSummaryResponse | null>(null);
  const [graphLoading, setGraphLoading] = useState<boolean>(true);
  const [graphError, setGraphError] = useState<string | null>(null);

  // Routing controls
  const [startNodeId, setStartNodeId] = useState<string>(DEMO_NODES[0].id);
  const [destinationNodeId, setDestinationNodeId] = useState<string>(DEMO_NODES[5].id); // Admin Exit
  const [strategy, setStrategy] = useState<RoutingStrategy>("shortest");
  const [floorFilter, setFloorFilter] = useState<FloorFilter>("all");

  // Congestion / ML scenario parameters
  const [walkingSpeed, setWalkingSpeed] = useState<number>(1.2);
  const [scenarioPreset, setScenarioPreset] = useState<"none" | "moderate" | "heavy">("none");

  // Dynamic hazard simulation scenario parameters
  const [hazardPreset, setHazardPreset] = useState<
    "none" | "fire_escape" | "ground_exit" | "all_admin_exits"
  >("none");

  // Zoom and pan navigation state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const handleZoomIn = () => setZoom((prev) => Math.min(2.5, Number((prev + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.75, Number((prev - 0.25).toFixed(2))));
  const handleResetZoomPan = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const handleFitToMap = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Inspection states
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);
  const [inspectedEdgeId, setInspectedEdgeId] = useState<string | null>(null);

  // Route calculation execution states
  const [routeLoading, setRouteLoading] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<RouteErrorInfo | null>(null);

  // Results
  const [shortestResult, setShortestResult] = useState<ShortestRouteResponse | null>(null);
  const [emergencyResult, setEmergencyResult] = useState<EmergencyAwareRouteResponse | null>(null);
  const [evacuationResult, setEvacuationResult] = useState<ExitSelectionResponse | null>(null);
  const [congestionResult, setCongestionResult] = useState<CongestionRouteResponse | null>(null);
  const [predictionResult, setPredictionResult] = useState<RouteTimePredictionResponse | null>(null);

  // Validation state: start and destination cannot be identical for point-to-point routing
  const isSameStartAndDest = strategy !== "evacuation" && startNodeId === destinationNodeId;

  // Route session history
  const [routeHistory, setRouteHistory] = useState<RouteHistoryItem[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  // Baseline distance tracker for before/after hazard comparison
  const [baselineDistance, setBaselineDistance] = useState<number | null>(null);

  // Active in-flight request tracker to prevent stale responses from overwriting newer scenarios
  const activeRequestIdRef = useRef<number>(0);

  // Load campus graph metadata on mount / campus change
  const fetchGraphMetadata = useCallback(async () => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      const summary = await getCampusGraph(campusId);
      setGraphSummary(summary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load campus graph metadata";
      setGraphError(msg);
    } finally {
      setGraphLoading(false);
    }
  }, [campusId]);

  useEffect(() => {
    fetchGraphMetadata();
  }, [fetchGraphMetadata]);

  // Active path node IDs from current result
  const activePathNodeIds = useMemo<string[]>(() => {
    if (strategy === "evacuation") {
      if (evacuationResult?.status === "route_found") {
        return evacuationResult.path_node_ids || [];
      }
      return [];
    }
    if (strategy === "emergency") {
      return emergencyResult?.path_node_ids || [];
    }
    if (strategy === "congestion") {
      return congestionResult?.path_node_ids || [];
    }
    if (strategy === "prediction") {
      return predictionResult?.path_node_ids || shortestResult?.path_node_ids || [];
    }
    if (strategy === "shortest" || strategy === "astar") {
      return shortestResult?.path_node_ids || [];
    }
    return [];
  }, [strategy, shortestResult, emergencyResult, evacuationResult, congestionResult, predictionResult]);

  // Active path edge IDs
  const activePathEdgeIds = useMemo<string[]>(() => {
    if (strategy === "evacuation") {
      if (evacuationResult?.status === "route_found") {
        return evacuationResult.steps.map((s) => s.edge_id);
      }
      return [];
    }
    if (strategy === "emergency") {
      return emergencyResult ? emergencyResult.steps.map((s) => s.edge_id) : [];
    }
    if (strategy === "congestion") {
      return congestionResult ? congestionResult.steps.map((s) => s.edge_id) : [];
    }
    if (strategy === "prediction") {
      return predictionResult?.edge_ids || (shortestResult ? shortestResult.steps.map((s) => s.edge_id) : []);
    }
    if (strategy === "shortest" || strategy === "astar") {
      return shortestResult ? shortestResult.steps.map((s) => s.edge_id) : [];
    }
    return [];
  }, [strategy, shortestResult, emergencyResult, evacuationResult, congestionResult, predictionResult]);

  // Generate explicit scenario inputs if preset chosen
  const edgeScenarios = useMemo<EdgeCrowdScenario[]>(() => {
    if (scenarioPreset === "none") return [];
    const timestamp = new Date().toISOString();
    if (scenarioPreset === "moderate") {
      return [
        {
          edge_id: "30000000-0000-4000-8000-000000000002", // Admin corridor
          occupancy_people: 25,
          capacity_people: 40,
          observed_at: timestamp,
        },
        {
          edge_id: "30000000-0000-4000-8000-000000000012", // Academic corridor
          occupancy_people: 30,
          capacity_people: 45,
          observed_at: timestamp,
        },
      ];
    }
    if (scenarioPreset === "heavy") {
      return [
        {
          edge_id: "30000000-0000-4000-8000-000000000005", // Admin Exit door
          occupancy_people: 50,
          capacity_people: 35, // Over-capacity
          observed_at: timestamp,
        },
        {
          edge_id: "30000000-0000-4000-8000-000000000010", // West exit to walkway
          occupancy_people: 45,
          capacity_people: 50,
          observed_at: timestamp,
        },
      ];
    }
    return [];
  }, [scenarioPreset]);

  // Generate simulated blocked edges based on explicit test scenario
  const simulatedBlockedEdgeIds = useMemo<string[]>(() => {
    if (hazardPreset === "none") return [];
    if (hazardPreset === "fire_escape") {
      return ["30000000-0000-4000-8000-000000000009"]; // ADM-1-COR -> ADM-1-EXIT (Fire escape)
    }
    if (hazardPreset === "ground_exit") {
      return ["30000000-0000-4000-8000-000000000005"]; // ADM-G-JCT -> ADM-G-EXIT
    }
    if (hazardPreset === "all_admin_exits") {
      return [
        "30000000-0000-4000-8000-000000000009",
        "30000000-0000-4000-8000-000000000005",
      ];
    }
    return [];
  }, [hazardPreset]);

  // Execute Route Request
  const handleCalculateRoute = async (
    overrideHazardPreset?: "none" | "fire_escape" | "ground_exit" | "all_admin_exits",
    overrideStrategy?: RoutingStrategy,
    overrideStartNodeId?: string,
    overrideDestNodeId?: string
  ) => {
    const activeStrategy = overrideStrategy ?? strategy;
    const activeStartNode = overrideStartNodeId ?? startNodeId;
    const activeDestNode = overrideDestNodeId ?? destinationNodeId;
    const activePreset = overrideHazardPreset ?? hazardPreset;

    // Check invalid identical endpoints
    if (activeStrategy !== "evacuation" && activeStartNode === activeDestNode) {
      setRouteError({
        kind: "invalid_request",
        title: "Identical Start and Destination",
        message: "Start location and destination must be distinct campus nodes.",
      });
      return;
    }

    const requestId = ++activeRequestIdRef.current;
    setRouteLoading(true);
    setRouteError(null);

    // Reset results for non-active strategies to prevent stale data bleed
    if (activeStrategy === "evacuation") {
      setShortestResult(null);
      setEmergencyResult(null);
      setCongestionResult(null);
      setPredictionResult(null);
      setEvacuationResult(null);
    } else if (activeStrategy === "emergency") {
      setShortestResult(null);
      setEvacuationResult(null);
      setCongestionResult(null);
      setPredictionResult(null);
      setEmergencyResult(null);
    } else {
      setEvacuationResult(null);
      setEmergencyResult(null);
      setCongestionResult(null);
      setPredictionResult(null);
      setShortestResult(null);
    }

    const blockedEdges =
      activePreset === "fire_escape"
        ? ["30000000-0000-4000-8000-000000000009"]
        : activePreset === "ground_exit"
        ? ["30000000-0000-4000-8000-000000000005"]
        : activePreset === "all_admin_exits"
        ? [
            "30000000-0000-4000-8000-000000000009",
            "30000000-0000-4000-8000-000000000005",
          ]
        : [];

    try {
      let resolvedDistance: number | null = null;
      let resolvedNodeCount = 0;

      if (activeStrategy === "shortest") {
        const res = await getShortestRoute(campusId, {
          start_node_id: activeStartNode,
          destination_node_id: activeDestNode,
          blocked_edge_ids: blockedEdges,
        });
        if (requestId !== activeRequestIdRef.current) return;
        setShortestResult(res);
        resolvedDistance = res.total_distance_m;
        resolvedNodeCount = res.path_node_ids.length;
        if (activePreset === "none") setBaselineDistance(res.total_distance_m);
      } else if (activeStrategy === "astar") {
        const res = await getAstarRoute(campusId, {
          start_node_id: activeStartNode,
          destination_node_id: activeDestNode,
          blocked_edge_ids: blockedEdges,
        });
        if (requestId !== activeRequestIdRef.current) return;
        setShortestResult(res);
        resolvedDistance = res.total_distance_m;
        resolvedNodeCount = res.path_node_ids.length;
        if (activePreset === "none") setBaselineDistance(res.total_distance_m);
      } else if (activeStrategy === "emergency") {
        const res = await getEmergencyAwareRoute(campusId, {
          start_node_id: activeStartNode,
          destination_node_id: activeDestNode,
          blocked_edge_ids: blockedEdges,
        });
        if (requestId !== activeRequestIdRef.current) return;
        setEmergencyResult(res);
        resolvedDistance = res.total_distance_m;
        resolvedNodeCount = res.path_node_ids.length;
      } else if (activeStrategy === "evacuation") {
        const res = await getEvacuationRoute(campusId, {
          start_node_id: activeStartNode,
          blocked_edge_ids: blockedEdges,
        });
        if (requestId !== activeRequestIdRef.current) return;
        setEvacuationResult(res);
        resolvedDistance = res.status === "route_found" ? res.total_distance_m : null;
        resolvedNodeCount = res.path_node_ids.length;
        if (activePreset === "none" && res.status === "route_found") {
          setBaselineDistance(res.total_distance_m);
        }
      } else if (activeStrategy === "congestion") {
        const res = await getCongestionRoute(campusId, {
          start_node_id: activeStartNode,
          destination_node_id: activeDestNode,
          base_walking_speed_mps: walkingSpeed,
          edge_scenarios: edgeScenarios,
        });
        if (requestId !== activeRequestIdRef.current) return;
        setCongestionResult(res);
        resolvedDistance = res.total_distance_m;
        resolvedNodeCount = res.path_node_ids.length;
      } else if (activeStrategy === "prediction") {
        // Step 1: obtain traversable path via baseline shortest route first
        const baseRoute = await getShortestRoute(campusId, {
          start_node_id: activeStartNode,
          destination_node_id: activeDestNode,
          blocked_edge_ids: blockedEdges,
        });
        if (requestId !== activeRequestIdRef.current) return;
        setShortestResult(baseRoute);

        // Step 2: predict travel time along this route
        const edgeIds = baseRoute.steps.map((s) => s.edge_id);
        resolvedDistance = baseRoute.total_distance_m;
        resolvedNodeCount = baseRoute.path_node_ids.length;

        try {
          const predRes = await predictRouteTime(campusId, {
            path_node_ids: baseRoute.path_node_ids,
            edge_ids: edgeIds,
            base_walking_speed_mps: walkingSpeed,
            edge_scenarios: edgeScenarios,
          });
          if (requestId !== activeRequestIdRef.current) return;
          setPredictionResult(predRes);
        } catch (predErr: unknown) {
          if (requestId !== activeRequestIdRef.current) return;
          setPredictionResult(null);
          const parsedErr = parseRoutingError(predErr);
          setRouteError({
            ...parsedErr,
            title: parsedErr.title || "Prediction Model Unavailable",
            message:
              parsedErr.title === "Prediction Model Unavailable"
                ? "The ML travel-time prediction model artifact is not deployed on this server. Standard physical path is retained below; switch to Dijkstra or A* for standard navigation."
                : `${parsedErr.message} Active path geometry is retained.`,
          });
        }
      }

      // Add to session history
      setRouteHistory((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          startNodeId: activeStartNode,
          destinationNodeId: activeDestNode,
          strategy: activeStrategy,
          hazardPreset: activePreset,
          distance: resolvedDistance,
          nodeCount: resolvedNodeCount,
        },
        ...prev.slice(0, 7), // Keep last 8 items
      ]);
    } catch (err: unknown) {
      if (requestId !== activeRequestIdRef.current) return;
      const errorInfo = parseRoutingError(err);
      setRouteError(errorInfo);
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setRouteLoading(false);
      }
    }
  };

  // Node selection handler for interactive SVG clicks
  const handleNodeClick = (node: GraphNodeDefinition) => {
    setInspectedNodeId(node.id);
    setInspectedEdgeId(null);
  };

  const handleSetStart = (id: string) => {
    setStartNodeId(id);
    if (strategy === "evacuation") {
      handleCalculateRoute(hazardPreset, "evacuation", id);
    }
  };

  const handleSetDestination = (id: string) => {
    setDestinationNodeId(id);
  };

  const handleClearRoute = () => {
    activeRequestIdRef.current++;
    setShortestResult(null);
    setEmergencyResult(null);
    setEvacuationResult(null);
    setCongestionResult(null);
    setPredictionResult(null);
    setRouteError(null);
  };

  // SVG coordinate transformation using presentation layer
  const transformCoordinates = useCallback(
    (x: number, y: number, floorId: string | null, nodeId?: string) => {
      return getPresentationCoordinates(x, y, floorId, floorFilter, nodeId);
    },
    [floorFilter]
  );

  // Filtered nodes based on floor filter
  const visibleNodes = useMemo(() => {
    return DEMO_NODES.filter((node) => {
      if (floorFilter === "all") return true;
      if (floorFilter === "ground") {
        return (
          node.floor_id === "12000000-0000-4000-8000-000000000001" ||
          node.floor_id === "12000000-0000-4000-8000-000000000003" ||
          node.floor_id === null // Outdoor
        );
      }
      if (floorFilter === "first") {
        return (
          node.floor_id === "12000000-0000-4000-8000-000000000002" ||
          node.floor_id === "12000000-0000-4000-8000-000000000004" ||
          node.node_type === "staircase"
        );
      }
      return true;
    });
  }, [floorFilter]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  // Deterministic collision-avoided placement for labels and START/DEST badge markers
  const { labelBoxes, badgeBoxes } = useMemo(() => {
    return computeAllLabelPositions(
      visibleNodes,
      floorFilter,
      startNodeId,
      destinationNodeId,
      activePathEdgeIds,
      DEMO_EDGES
    );
  }, [visibleNodes, floorFilter, startNodeId, destinationNodeId, activePathEdgeIds]);

  // FULL ROUTE SEGMENT EXTRACTION:
  // Connects every consecutive pair (node_i, node_{i+1}) along the returned path!
  const fullRouteSegments = useMemo(() => {
    if (activePathNodeIds.length < 2) return [];
    const segments: Array<{
      fromId: string;
      toId: string;
      fromNode: GraphNodeDefinition;
      toNode: GraphNodeDefinition;
      p1: { svgX: number; svgY: number };
      p2: { svgX: number; svgY: number };
      edge?: GraphEdgeDefinition;
      distance?: number;
      isCrossFloor: boolean;
      isHiddenByFilter: boolean;
    }> = [];

    for (let i = 0; i < activePathNodeIds.length - 1; i++) {
      const fromId = activePathNodeIds[i];
      const toId = activePathNodeIds[i + 1];
      const fromNode = getNodeById(fromId);
      const toNode = getNodeById(toId);
      if (!fromNode || !toNode) continue;

      const p1 = transformCoordinates(fromNode.x, fromNode.y, fromNode.floor_id, fromNode.id);
      const p2 = transformCoordinates(toNode.x, toNode.y, toNode.floor_id, toNode.id);

      const edge = findEdgeBetween(fromId, toId) || DEMO_EDGES.find(
        (e) => (e.from_node_id === fromId && e.to_node_id === toId) ||
               (e.bidirectional && e.from_node_id === toId && e.to_node_id === fromId)
      );

      const isCrossFloor = fromNode.floor_id !== toNode.floor_id;
      const isHiddenByFilter = floorFilter !== "all" && (!visibleNodeIds.has(fromId) || !visibleNodeIds.has(toId));

      segments.push({
        fromId,
        toId,
        fromNode,
        toNode,
        p1,
        p2,
        edge,
        distance: edge?.distance,
        isCrossFloor,
        isHiddenByFilter,
      });
    }
    return segments;
  }, [activePathNodeIds, transformCoordinates, floorFilter, visibleNodeIds]);

  // Count route nodes outside active floor filter
  const hiddenRouteNodeCount = useMemo(() => {
    if (floorFilter === "all") return 0;
    return activePathNodeIds.filter((id) => !visibleNodeIds.has(id)).length;
  }, [activePathNodeIds, floorFilter, visibleNodeIds]);

  // Floor Transitions along active path (Requirement 4.5: STAIRS ↑ FIRST FLOOR / STAIRS ↓ GROUND FLOOR)
  const floorTransitions = useMemo(() => {
    const transitions: Array<{
      direction: "UP" | "DOWN";
      indicator: string;
      fromNode: GraphNodeDefinition;
      toNode: GraphNodeDefinition;
    }> = [];

    for (let i = 0; i < activePathNodeIds.length - 1; i++) {
      const fromNode = getNodeById(activePathNodeIds[i]);
      const toNode = getNodeById(activePathNodeIds[i + 1]);
      if (!fromNode || !toNode) continue;
      if (fromNode.floor_id !== toNode.floor_id) {
        const isUp =
          (fromNode.floor_name?.includes("Ground") || fromNode.floor_id?.endsWith("1") || fromNode.floor_id?.endsWith("3")) &&
          (toNode.floor_name?.includes("First") || toNode.floor_id?.endsWith("2") || toNode.floor_id?.endsWith("4"));
        transitions.push({
          direction: isUp ? "UP" : "DOWN",
          indicator: isUp ? "STAIRS ↑ FIRST FLOOR" : "STAIRS ↓ GROUND FLOOR",
          fromNode,
          toNode,
        });
      }
    }
    return transitions;
  }, [activePathNodeIds]);

  // Inspected objects
  const inspectedNode = inspectedNodeId ? getNodeById(inspectedNodeId) : null;
  const inspectedEdge = inspectedEdgeId
    ? DEMO_EDGES.find((e) => e.id === inspectedEdgeId) || null
    : null;

  // Copy route summary action
  const handleCopySummary = () => {
    const startNode = getNodeById(startNodeId);
    const destNode = getNodeById(destinationNodeId);
    let distStr = "—";
    if (strategy === "evacuation") {
      distStr = evacuationResult?.status === "route_found" && evacuationResult.total_distance_m !== null
        ? `${evacuationResult.total_distance_m.toFixed(1)}m`
        : "No route";
    } else if (shortestResult?.total_distance_m !== null && shortestResult?.total_distance_m !== undefined) {
      distStr = `${shortestResult.total_distance_m.toFixed(1)}m`;
    }

    const pathCodes = activePathNodeIds.map((id) => getNodeById(id)?.code || id).join(" -> ");
    const summary = `Sentinel EvacOS Route Summary:\n• Strategy: ${strategy}\n• Hazard: ${hazardPreset}\n• Start: ${startNode?.code} (${startNode?.name})\n• Destination: ${destNode?.code} (${destNode?.name})\n• Route Cost / Distance: ${distStr}\n• Path Sequence: ${pathCodes}`;

    navigator.clipboard?.writeText(summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Hidden route nodes alert banner when active floor filter hides part of route */}
      {hiddenRouteNodeCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-950/40 p-3 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              Active route spans multiple floors: <strong>{hiddenRouteNodeCount} node(s)</strong> are currently on another floor view.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFloorFilter("all")}
            className="rounded bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors"
          >
            Switch to All Floors View
          </button>
        </div>
      )}

      {/* Cross-Floor Staircase Transition Alert Banner (Requirement 4.5) */}
      {floorTransitions.map((t, idx) => (
        <div
          key={`floor-trans-top-${idx}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-cyan-500/40 bg-cyan-950/40 p-3 text-xs text-cyan-200"
        >
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-400 shrink-0" />
            <span className="font-mono font-bold tracking-wide">{t.indicator}</span>
            <span className="text-[#94A3B8]">
              via {t.fromNode.name} → {t.toNode.name}
            </span>
          </div>
          {floorFilter !== "all" && (
            <button
              type="button"
              onClick={() => setFloorFilter("all")}
              className="rounded bg-cyan-500/20 px-2.5 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/30 transition-colors"
            >
              Switch to All Floors View
            </button>
          )}
        </div>
      ))}

      {/* Main 3-Region Workspace Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* REGION A: LEFT CONTROL PANEL (3 cols on lg) */}
        <div className="flex flex-col gap-5 lg:col-span-3">
          <Card className="border border-[#263449] bg-[#111827] shadow-lg">
            <CardHeader className="border-b border-[#263449] pb-3 pt-4 px-4">
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-cyan-400" />
                <CardTitle className="text-sm font-semibold text-[#F1F5F9]">
                  Navigation Controls
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-[#94A3B8]">
                Configure endpoints, algorithm, and test hazard scenarios.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4 p-4 text-xs">
              {/* Start Node Selector */}
              <div>
                <label className="mb-1.5 flex items-center justify-between font-semibold text-[#F1F5F9]">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Starting Location
                  </span>
                  <span className="text-[10px] text-[#94A3B8] font-normal">Source Node</span>
                </label>
                <select
                  value={startNodeId}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    setStartNodeId(nextStart);
                    if (strategy === "evacuation") {
                      handleCalculateRoute(hazardPreset, "evacuation", nextStart);
                    } else {
                      handleClearRoute();
                    }
                  }}
                  className="w-full rounded-md border border-[#263449] bg-[#172033] px-2.5 py-2 text-xs font-medium text-[#F1F5F9] focus:border-cyan-400 focus:outline-none"
                >
                  <optgroup label="Building 1 — CSE Department (1st Floor)" className="bg-[#111827] text-cyan-400 font-semibold">
                    {DEMO_NODES.filter((n) => n.id === "20000000-0000-4000-8000-000000000007" || n.id === "20000000-0000-4000-8000-000000000008" || n.id === "20000000-0000-4000-8000-000000000009" || n.id === "20000000-0000-4000-8000-000000000010").map((node) => (
                      <option key={node.id} value={node.id} className="text-[#F1F5F9] font-normal">
                        {node.code} — {node.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Building 2 — IT Department (1st Floor)" className="bg-[#111827] text-cyan-400 font-semibold">
                    {DEMO_NODES.filter((n) => n.id === "20000000-0000-4000-8000-000000000017" || n.id === "20000000-0000-4000-8000-000000000018" || n.id === "20000000-0000-4000-8000-000000000019").map((node) => (
                      <option key={node.id} value={node.id} className="text-[#F1F5F9] font-normal">
                        {node.code} — {node.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Building 3 — AI & ML Department (Ground Floor)" className="bg-[#111827] text-cyan-400 font-semibold">
                    {DEMO_NODES.filter((n) => n.floor_id === "12000000-0000-4000-8000-000000000001").map((node) => (
                      <option key={node.id} value={node.id} className="text-[#F1F5F9] font-normal">
                        {node.code} — {node.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Building 4 — CSBS Department (Ground Floor)" className="bg-[#111827] text-cyan-400 font-semibold">
                    {DEMO_NODES.filter((n) => n.floor_id === "12000000-0000-4000-8000-000000000003").map((node) => (
                      <option key={node.id} value={node.id} className="text-[#F1F5F9] font-normal">
                        {node.code} — {node.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Campus Grounds & Central Quad" className="bg-[#111827] text-cyan-400 font-semibold">
                    {DEMO_NODES.filter((n) => n.floor_id === null).map((node) => (
                      <option key={node.id} value={node.id} className="text-[#F1F5F9] font-normal">
                        {node.code} — {node.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Destination Node Selector */}
              {strategy !== "evacuation" ? (
                <div>
                  <label className="mb-1.5 flex items-center justify-between font-semibold text-[#F1F5F9]">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-cyan-400" />
                      Destination
                    </span>
                    <span className="text-[10px] text-[#94A3B8] font-normal">Target Node</span>
                  </label>
                  <select
                    value={destinationNodeId}
                    onChange={(e) => {
                      setDestinationNodeId(e.target.value);
                      handleClearRoute();
                    }}
                    className={`w-full rounded-md border bg-[#172033] px-2.5 py-2 text-xs font-medium text-[#F1F5F9] focus:outline-none ${
                      isSameStartAndDest
                        ? "border-red-500/70 focus:border-red-400"
                        : "border-[#263449] focus:border-cyan-400"
                    }`}
                  >
                    <optgroup label="Building 1 — CSE Department (1st Floor)" className="bg-[#111827] text-cyan-400 font-semibold">
                      {DEMO_NODES.filter((n) => n.id === "20000000-0000-4000-8000-000000000007" || n.id === "20000000-0000-4000-8000-000000000008" || n.id === "20000000-0000-4000-8000-000000000009" || n.id === "20000000-0000-4000-8000-000000000010").map((node) => (
                        <option key={node.id} value={node.id} className="text-[#F1F5F9] font-normal">
                          {node.code} — {node.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Building 2 — IT Department (1st Floor)" className="bg-[#111827] text-cyan-400 font-semibold">
                      {DEMO_NODES.filter((n) => n.id === "20000000-0000-4000-8000-000000000017" || n.id === "20000000-0000-4000-8000-000000000018" || n.id === "20000000-0000-4000-8000-000000000019").map((node) => (
                        <option key={node.id} value={node.id} className="text-[#F1F5F9] font-normal">
                          {node.code} — {node.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Building 3 — AI & ML Department (Ground Floor)" className="bg-[#111827] text-cyan-400 font-semibold">
                      {DEMO_NODES.filter((n) => n.floor_id === "12000000-0000-4000-8000-000000000001").map((node) => (
                        <option key={node.id} value={node.id} className="text-[#F1F5F9] font-normal">
                          {node.code} — {node.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Building 4 — CSBS Department (Ground Floor)" className="bg-[#111827] text-cyan-400 font-semibold">
                      {DEMO_NODES.filter((n) => n.floor_id === "12000000-0000-4000-8000-000000000003").map((node) => (
                        <option key={node.id} value={node.id} className="text-[#F1F5F9] font-normal">
                          {node.code} — {node.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Campus Grounds & Central Quad" className="bg-[#111827] text-cyan-400 font-semibold">
                      {DEMO_NODES.filter((n) => n.floor_id === null).map((node) => (
                        <option key={node.id} value={node.id} className="text-[#F1F5F9] font-normal">
                          {node.code} — {node.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  {isSameStartAndDest && (
                    <p className="mt-1 text-[11px] text-red-400">
                      Destination must be distinct from starting location.
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-950/30 p-2.5 text-xs text-emerald-300">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Dynamic Evacuation Mode</span>
                  </div>
                  <p className="mt-1 text-[11px] text-emerald-200/80 leading-relaxed">
                    Evaluates all 3 campus exits and routes to the closest reachable safe exit.
                  </p>
                </div>
              )}

              {/* Routing Strategy Selector */}
              <div>
                <label className="mb-1.5 block font-semibold text-[#F1F5F9]">
                  Pathfinding Algorithm
                </label>
                <select
                  value={strategy}
                  onChange={(e) => {
                    const nextStrategy = e.target.value as RoutingStrategy;
                    setStrategy(nextStrategy);
                    handleClearRoute();
                  }}
                  className="w-full rounded-md border border-[#263449] bg-[#172033] px-2.5 py-2 text-xs font-medium text-[#F1F5F9] focus:border-cyan-400 focus:outline-none"
                >
                  <option value="shortest">Dijkstra's Algorithm (Minimum Cost)</option>
                  <option value="astar">A* Search (Zero Heuristic f=g+h)</option>
                  <option value="emergency">Emergency-Aware (Hazard Penalty)</option>
                  <option value="evacuation">Nearest Exit Evacuation (Exit Selection)</option>
                  <option value="congestion">Congestion Scenario Pathfinding</option>
                  <option value="prediction">ML Evacuation Time Prediction (Requires Model Artifact)</option>
                </select>
              </div>

              {/* Hazard Simulation (Demo Only) - Tested requirement with exact IDs and option labels */}
              <div className="flex flex-col gap-2 rounded-lg border border-[#263449] bg-[#172033] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#F1F5F9]">Hazard Simulation (Demo Only)</span>
                  <Badge variant="outline" className="border-red-500/40 bg-red-950/60 text-[10px] font-semibold text-red-300">
                    Demo Preset
                  </Badge>
                </div>
                <div>
                  <label htmlFor="hazard-scenario-select" className="mb-1 block text-[11px] text-[#94A3B8]">
                    Scenario Preset
                  </label>
                  <select
                    id="hazard-scenario-select"
                    data-testid="hazard-simulation-select"
                    value={hazardPreset}
                    onChange={(e) => {
                      const next = e.target.value as "none" | "fire_escape" | "ground_exit" | "all_admin_exits";
                      setHazardPreset(next);
                      handleCalculateRoute(next);
                    }}
                    className="w-full rounded border border-[#263449] bg-[#111827] px-2 py-1.5 text-xs text-[#F1F5F9] focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="none">Baseline — No simulated blockages</option>
                    <option value="fire_escape">1st Floor Fire Escape Blocked</option>
                    <option value="ground_exit">West Ground Emergency Exit Blocked</option>
                    <option value="all_admin_exits">All Administration Exits Blocked</option>
                  </select>
                </div>
                <p className="text-[10px] text-[#94A3B8] italic leading-tight">
                  Simulates synthetic obstacle blockages on authoritative topology edges.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  onClick={() => handleCalculateRoute()}
                  disabled={routeLoading || isSameStartAndDest}
                  className="flex-1 gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {routeLoading ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Navigation className="h-3.5 w-3.5" />
                  )}
                  Calculate Route
                </Button>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleClearRoute}
                  title="Clear calculated route"
                  className="border-[#263449] bg-[#172033] hover:bg-[#1e293b] text-[#94A3B8] hover:text-[#F1F5F9]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Error callout */}
              {routeError && (
                <div
                  className={`flex items-start gap-2 rounded-lg border p-3 text-xs transition-colors ${
                    routeError.kind === "unreachable"
                      ? "border-red-500/40 bg-red-950/40"
                      : routeError.kind === "network"
                      ? "border-amber-500/40 bg-amber-950/40"
                      : "border-slate-600 bg-slate-800"
                  }`}
                  role="alert"
                >
                  <AlertTriangle
                    className={`h-4 w-4 shrink-0 mt-0.5 ${
                      routeError.kind === "network" ? "text-amber-400" : "text-red-400"
                    }`}
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-[#F1F5F9]">{routeError.title}</p>
                    <p className="mt-0.5 text-[11px] text-[#94A3B8] leading-relaxed">{routeError.message}</p>
                    {strategy === "prediction" && (
                      <div className="mt-2.5 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setStrategy("shortest");
                            handleCalculateRoute(hazardPreset, "shortest");
                          }}
                          className="h-7 text-[11px] border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300"
                        >
                          Switch to Dijkstra
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setStrategy("astar");
                            handleCalculateRoute(hazardPreset, "astar");
                          }}
                          className="h-7 text-[11px] border-slate-600 bg-slate-800 hover:bg-slate-700 text-[#F1F5F9]"
                        >
                          Switch to A*
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Algorithm Explanation Card */}
              <div className="rounded-lg border border-[#263449] bg-[#0B1120] p-3 text-[11px] text-[#94A3B8]">
                <div className="flex items-center gap-1.5 font-semibold text-[#F1F5F9]">
                  <Info className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  <span>
                    {strategy === "astar"
                      ? "A* Search Principles"
                      : strategy === "shortest"
                      ? "Dijkstra Principles"
                      : strategy === "evacuation"
                      ? "Evacuation Principles"
                      : "Algorithm Principles"}
                  </span>
                </div>
                <p className="mt-1 leading-relaxed">
                  {strategy === "astar"
                    ? "Uses f(n) = g(n) + h(n), where g(n) is accumulated path cost and h(n) estimates remaining cost. Note: Currently h(n)=0 due to non-geometric coordinate space."
                    : strategy === "shortest"
                    ? "Finds a minimum-cost path in a graph with non-negative edge weights using greedy vertex exploration."
                    : strategy === "evacuation"
                    ? "Evaluates all available emergency exits under current blockages and returns the shortest reachable evacuation path."
                    : "Optimizes path traversal under active topological constraints."}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Session Route History Mini-Panel */}
          {routeHistory.length > 0 && (
            <Card className="border border-[#263449] bg-[#111827] shadow-lg">
              <CardHeader className="border-b border-[#263449] pb-2.5 pt-3 px-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-cyan-400" />
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                    Recent Calculations ({routeHistory.length})
                  </CardTitle>
                </div>
                <button
                  type="button"
                  onClick={() => setRouteHistory([])}
                  className="text-[10px] text-[#94A3B8] hover:text-red-400 transition-colors"
                >
                  Clear
                </button>
              </CardHeader>
              <CardContent className="p-3 text-xs max-h-44 overflow-y-auto flex flex-col gap-1.5">
                {routeHistory.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setStartNodeId(item.startNodeId);
                      setDestinationNodeId(item.destinationNodeId);
                      setStrategy(item.strategy);
                      setHazardPreset(item.hazardPreset);
                      handleCalculateRoute(item.hazardPreset, item.strategy, item.startNodeId, item.destinationNodeId);
                    }}
                    className="flex items-center justify-between rounded p-1.5 bg-[#172033] border border-[#263449] hover:border-cyan-400/50 hover:bg-[#1E293B] text-left transition-all"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-mono text-[10px] text-[#F1F5F9] truncate">
                        {getNodeById(item.startNodeId)?.code} → {getNodeById(item.destinationNodeId)?.code}
                      </span>
                      <span className="text-[9px] text-[#94A3B8]">
                        {item.strategy} · {item.hazardPreset !== "none" ? "Hazard" : "Normal"}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-emerald-400 font-semibold shrink-0 ml-2">
                      {item.distance !== null ? `${item.distance.toFixed(1)}m` : "No route"}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* REGION B: CENTRAL CAMPUS MAP (Centerpiece, 6 cols on lg) */}
        <div className="flex flex-col gap-4 lg:col-span-6">
          <Card className="border border-[#263449] bg-[#111827] shadow-xl overflow-hidden">
            {/* Map Header with Floor Filter Controls */}
            <CardHeader className="flex flex-row flex-wrap items-center justify-between border-b border-[#263449] bg-[#111827] pb-3 pt-3 px-4 gap-2">
              <div className="flex items-center gap-2">
                <RouteIcon className="h-4 w-4 text-cyan-400" />
                <CardTitle className="text-sm font-semibold text-[#F1F5F9]">
                  Campus Sector Map
                </CardTitle>
                <Badge
                  variant="outline"
                  className="hidden sm:inline-flex border-cyan-500/30 bg-cyan-950/40 text-[10px] text-cyan-300 font-mono"
                >
                  Interactive Topology
                </Badge>
              </div>

              {/* Floor Switcher */}
              <div className="flex items-center rounded-lg border border-[#263449] bg-[#0B1120] p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setFloorFilter("all")}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                    floorFilter === "all"
                      ? "bg-cyan-500 text-slate-950 shadow-sm"
                      : "text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#172033]"
                  }`}
                >
                  All Floors
                </button>
                <button
                  type="button"
                  onClick={() => setFloorFilter("ground")}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                    floorFilter === "ground"
                      ? "bg-cyan-500 text-slate-950 shadow-sm"
                      : "text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#172033]"
                  }`}
                >
                  Ground Floor
                </button>
                <button
                  type="button"
                  onClick={() => setFloorFilter("first")}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                    floorFilter === "first"
                      ? "bg-cyan-500 text-slate-950 shadow-sm"
                      : "text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#172033]"
                  }`}
                >
                  First Floor
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-3 sm:p-4">
              {/* SVG Canvas Area with Extended Viewing Space & Zoom/Pan */}
              <div className="relative h-[540px] sm:h-[600px] lg:h-[660px] w-full overflow-hidden rounded-xl border border-[#263449] bg-[#0B1120] shadow-inner select-none">
                {/* Floating Map Navigation Toolbar */}
                <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-[#263449] bg-[#111827]/90 p-1 backdrop-blur-md shadow-md">
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    aria-label="Zoom in"
                    className="rounded p-1.5 text-[#94A3B8] hover:bg-[#172033] hover:text-[#F1F5F9] transition-colors"
                    title="Zoom In (+)"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <span className="px-1 text-[11px] font-mono text-cyan-400 select-none min-w-[38px] text-center font-semibold">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    aria-label="Zoom out"
                    className="rounded p-1.5 text-[#94A3B8] hover:bg-[#172033] hover:text-[#F1F5F9] transition-colors"
                    title="Zoom Out (-)"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <div className="h-4 w-[1px] bg-[#263449] mx-0.5" />
                  <button
                    type="button"
                    onClick={handleFitToMap}
                    aria-label="Fit to map"
                    className="rounded p-1.5 text-[#94A3B8] hover:bg-[#172033] hover:text-cyan-400 transition-colors"
                    title="Fit to Map"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleResetZoomPan}
                    aria-label="Reset view"
                    className="rounded p-1.5 text-[#94A3B8] hover:bg-[#172033] hover:text-[#F1F5F9] transition-colors"
                    title="Reset View"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>

                {/* Floating Map Status Overlay */}
                <div className="absolute bottom-2.5 left-3 pointer-events-none text-[10px] text-[#94A3B8] font-mono z-10 bg-[#111827]/80 px-2.5 py-1 rounded border border-[#263449]/70 backdrop-blur-xs">
                  Scroll / drag to explore · Click nodes or edges to inspect
                </div>

                {/* Main Interactive SVG Canvas */}
                <svg
                  viewBox="0 0 1000 620"
                  className={`h-full w-full ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                  aria-label="Campus Graph SVG Map"
                  onWheel={(e) => {
                    const delta = e.deltaY < 0 ? 0.15 : -0.15;
                    setZoom((prev) => Math.min(2.5, Math.max(0.75, Number((prev + delta).toFixed(2)))));
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    setIsDragging(true);
                    dragStartRef.current = {
                      x: e.clientX,
                      y: e.clientY,
                      panX: pan.x,
                      panY: pan.y,
                    };
                  }}
                  onPointerMove={(e) => {
                    if (!isDragging || !dragStartRef.current) return;
                    const dx = ((e.clientX - dragStartRef.current.x) * 1.0) / zoom;
                    const dy = ((e.clientY - dragStartRef.current.y) * 1.0) / zoom;
                    setPan({
                      x: dragStartRef.current.panX + dx,
                      y: dragStartRef.current.panY + dy,
                    });
                  }}
                  onPointerUp={() => {
                    setIsDragging(false);
                    dragStartRef.current = null;
                  }}
                  onPointerLeave={() => {
                    setIsDragging(false);
                    dragStartRef.current = null;
                  }}
                >
                  <defs>
                    {/* Dark Blueprint Grid Pattern */}
                    <pattern
                      id="dark-cad-grid"
                      width="40"
                      height="40"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 40 0 L 0 0 0 40"
                        fill="none"
                        stroke="#172033"
                        strokeWidth="0.8"
                        opacity="0.4"
                      />
                    </pattern>

                    {/* Marker for directed edges (normal) */}
                    <marker
                      id="directed-arrow-dark"
                      viewBox="0 0 10 10"
                      refX="16"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 9 5 L 0 9 z" fill="#526176" />
                    </marker>

                    {/* Direction marker for full calculated route path */}
                    <marker
                      id="route-arrow-dark"
                      viewBox="0 0 10 10"
                      refX="14"
                      refY="5"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 9 5 L 0 9 z" fill="#34D399" />
                    </marker>

                    {/* Outer glow filter for calculated route */}
                    <filter id="route-glow-dark" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="3.5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Main Transform Group for Pan & Zoom */}
                  <g
                    transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
                    style={{
                      transformOrigin: "500px 310px",
                      transition: isDragging ? "none" : "transform 0.12s ease-out",
                    }}
                  >
                    {/* CAD Blueprint Background */}
                    <rect
                      x="0"
                      y="0"
                      width="1000"
                      height="620"
                      fill="url(#dark-cad-grid)"
                    />

                    {/* Perimeter Architectural Boundary */}
                    <rect
                      x="20"
                      y="20"
                      width="960"
                      height="580"
                      rx="14"
                      fill="none"
                      stroke="#1E293B"
                      strokeWidth="1.5"
                      strokeDasharray="6 4"
                    />

                    {/* ======================================================== */}
                    {/* ARCHITECTURAL SITE PLAN: 4 BUILDINGS, MAIN GATE & QUAD   */}
                    {/* ======================================================== */}
                    <g id="campus-architectural-site-plan">
                      {/* 1. NORTH-WEST: BUILDING 1 — CSE DEPARTMENT */}
                      <g id="bldg-1-cse" className="transition-opacity duration-200">
                        <rect
                          x="40"
                          y="40"
                          width="370"
                          height="210"
                          rx="10"
                          fill="#111827"
                          fillOpacity={floorFilter === "ground" ? 0.35 : 0.95}
                          stroke="#263449"
                          strokeWidth="1.5"
                        />
                        {/* Architectural inner corridor line */}
                        <line
                          x1="55"
                          y1="130"
                          x2="395"
                          y2="130"
                          stroke="#1E293B"
                          strokeWidth="1.2"
                          strokeDasharray="4 3"
                        />
                        {/* Building Header Badge */}
                        <g className="pointer-events-none select-none">
                          <rect
                            x="50"
                            y="24"
                            width="220"
                            height="28"
                            rx="6"
                            fill="#172033"
                            stroke="#263449"
                            strokeWidth="1.2"
                          />
                          <text
                            x="160"
                            y="42"
                            textAnchor="middle"
                            fill="#22D3EE"
                            fontSize="12"
                            fontWeight="700"
                            letterSpacing="0.04em"
                            fontFamily="system-ui, -apple-system, sans-serif"
                          >
                            BLDG 1 · CSE DEPARTMENT
                          </text>
                        </g>
                        <text
                          x="55"
                          y="235"
                          fill="#94A3B8"
                          fontSize="10"
                          fontWeight="500"
                          letterSpacing="0.03em"
                          className="pointer-events-none select-none font-mono"
                        >
                          North-West Wing · 1st Floor Computing Labs
                        </text>
                      </g>

                      {/* 2. NORTH-EAST: BUILDING 2 — IT DEPARTMENT */}
                      <g id="bldg-2-it" className="transition-opacity duration-200">
                        <rect
                          x="590"
                          y="40"
                          width="370"
                          height="210"
                          rx="10"
                          fill="#111827"
                          fillOpacity={floorFilter === "ground" ? 0.35 : 0.95}
                          stroke="#263449"
                          strokeWidth="1.5"
                        />
                        {/* Architectural inner corridor line */}
                        <line
                          x1="605"
                          y1="130"
                          x2="945"
                          y2="130"
                          stroke="#1E293B"
                          strokeWidth="1.2"
                          strokeDasharray="4 3"
                        />
                        {/* Building Header Badge */}
                        <g className="pointer-events-none select-none">
                          <rect
                            x="730"
                            y="24"
                            width="215"
                            height="28"
                            rx="6"
                            fill="#172033"
                            stroke="#263449"
                            strokeWidth="1.2"
                          />
                          <text
                            x="837"
                            y="42"
                            textAnchor="middle"
                            fill="#22D3EE"
                            fontSize="12"
                            fontWeight="700"
                            letterSpacing="0.04em"
                            fontFamily="system-ui, -apple-system, sans-serif"
                          >
                            BLDG 2 · IT DEPARTMENT
                          </text>
                        </g>
                        <text
                          x="605"
                          y="235"
                          fill="#94A3B8"
                          fontSize="10"
                          fontWeight="500"
                          letterSpacing="0.03em"
                          className="pointer-events-none select-none font-mono"
                        >
                          North-East Wing · Software & Projects
                        </text>
                      </g>

                      {/* 3. SOUTH-WEST: BUILDING 3 — AI & ML DEPARTMENT */}
                      <g id="bldg-3-aiml" className="transition-opacity duration-200">
                        <rect
                          x="40"
                          y="290"
                          width="370"
                          height="210"
                          rx="10"
                          fill="#111827"
                          fillOpacity={floorFilter === "first" ? 0.35 : 0.95}
                          stroke="#263449"
                          strokeWidth="1.5"
                        />
                        {/* Architectural inner corridor line */}
                        <line
                          x1="55"
                          y1="430"
                          x2="395"
                          y2="430"
                          stroke="#1E293B"
                          strokeWidth="1.2"
                          strokeDasharray="4 3"
                        />
                        {/* Building Header Badge */}
                        <g className="pointer-events-none select-none">
                          <rect
                            x="50"
                            y="274"
                            width="235"
                            height="28"
                            rx="6"
                            fill="#172033"
                            stroke="#263449"
                            strokeWidth="1.2"
                          />
                          <text
                            x="167"
                            y="292"
                            textAnchor="middle"
                            fill="#F1F5F9"
                            fontSize="12"
                            fontWeight="700"
                            letterSpacing="0.04em"
                            fontFamily="system-ui, -apple-system, sans-serif"
                          >
                            BLDG 3 · AI & ML DEPARTMENT
                          </text>
                        </g>
                        <text
                          x="55"
                          y="485"
                          fill="#94A3B8"
                          fontSize="10"
                          fontWeight="500"
                          letterSpacing="0.03em"
                          className="pointer-events-none select-none font-mono"
                        >
                          South-West Wing · Ground Intelligence Labs
                        </text>
                      </g>

                      {/* 4. SOUTH-EAST: BUILDING 4 — CSBS DEPARTMENT */}
                      <g id="bldg-4-csbs" className="transition-opacity duration-200">
                        <rect
                          x="590"
                          y="290"
                          width="370"
                          height="210"
                          rx="10"
                          fill="#111827"
                          fillOpacity={floorFilter === "first" ? 0.35 : 0.95}
                          stroke="#263449"
                          strokeWidth="1.5"
                        />
                        {/* Architectural inner corridor line */}
                        <line
                          x1="605"
                          y1="430"
                          x2="945"
                          y2="430"
                          stroke="#1E293B"
                          strokeWidth="1.2"
                          strokeDasharray="4 3"
                        />
                        {/* Building Header Badge */}
                        <g className="pointer-events-none select-none">
                          <rect
                            x="730"
                            y="274"
                            width="215"
                            height="28"
                            rx="6"
                            fill="#172033"
                            stroke="#263449"
                            strokeWidth="1.2"
                          />
                          <text
                            x="837"
                            y="292"
                            textAnchor="middle"
                            fill="#F1F5F9"
                            fontSize="12"
                            fontWeight="700"
                            letterSpacing="0.04em"
                            fontFamily="system-ui, -apple-system, sans-serif"
                          >
                            BLDG 4 · CSBS DEPARTMENT
                          </text>
                        </g>
                        <text
                          x="605"
                          y="485"
                          fill="#94A3B8"
                          fontSize="10"
                          fontWeight="500"
                          letterSpacing="0.03em"
                          className="pointer-events-none select-none font-mono"
                        >
                          South-East Wing · Business Systems & Seminars
                        </text>
                      </g>

                      {/* 5. CENTRE: CENTRAL CAMPUS QUAD & ASSEMBLY POINT */}
                      <g id="central-courtyard-quad">
                        {/* Landscaped Quad Boundary */}
                        <rect
                          x="430"
                          y="40"
                          width="140"
                          height="440"
                          rx="12"
                          fill="#172033"
                          fillOpacity="0.45"
                          stroke="#263449"
                          strokeWidth="1.2"
                          strokeDasharray="4 3"
                        />
                        {/* Inner Lawn circle accent */}
                        <circle
                          cx="500"
                          cy="130"
                          r="48"
                          fill="#064E3B"
                          fillOpacity="0.3"
                          stroke="#34D399"
                          strokeWidth="1.2"
                          strokeDasharray="4 3"
                        />
                        {/* Assembly Grounds Header */}
                        <g className="pointer-events-none select-none">
                          <rect
                            x="440"
                            y="48"
                            width="120"
                            height="24"
                            rx="5"
                            fill="#172033"
                            stroke="#FBBF24"
                            strokeOpacity="0.6"
                            strokeWidth="1.2"
                          />
                          <text
                            x="500"
                            y="64"
                            textAnchor="middle"
                            fill="#FBBF24"
                            fontSize="10"
                            fontWeight="700"
                            letterSpacing="0.05em"
                            fontFamily="system-ui, -apple-system, sans-serif"
                          >
                            ASSEMBLY ZONE
                          </text>
                        </g>
                      </g>

                      {/* 6. SOUTH SIDE: PROMINENT MAIN GATE */}
                      <g id="campus-main-gate" className="transition-opacity duration-200">
                        {/* Paved Gate Plaza */}
                        <rect
                          x="410"
                          y="505"
                          width="180"
                          height="85"
                          rx="8"
                          fill="#111827"
                          fillOpacity={floorFilter === "first" ? 0.3 : 0.9}
                          stroke="#263449"
                          strokeWidth="1.5"
                        />
                        {/* Left Security Gate Pillar */}
                        <rect
                          x="425"
                          y="515"
                          width="20"
                          height="36"
                          rx="4"
                          fill="#0B1120"
                          stroke={floorFilter === "first" ? "#526176" : "#22D3EE"}
                          strokeWidth="1.8"
                        />
                        {/* Right Security Gate Pillar */}
                        <rect
                          x="555"
                          y="515"
                          width="20"
                          height="36"
                          rx="4"
                          fill="#0B1120"
                          stroke={floorFilter === "first" ? "#526176" : "#22D3EE"}
                          strokeWidth="1.8"
                        />
                        {/* Central Gate Arch Overhead Barrier */}
                        <line
                          x1="435"
                          y1="522"
                          x2="565"
                          y2="522"
                          stroke={floorFilter === "first" ? "#526176" : "#22D3EE"}
                          strokeWidth="2.5"
                        />
                        {/* Main Gate Entry Walkway Avenue connecting to Central Quad */}
                        <line
                          x1="500"
                          y1="510"
                          x2="500"
                          y2="408"
                          stroke="#22D3EE"
                          strokeWidth="3.5"
                          strokeDasharray="4 3"
                          strokeOpacity={floorFilter === "first" ? 0.2 : 0.6}
                        />
                        {/* Main Gate Text Badge */}
                        <g className="pointer-events-none select-none">
                          <rect
                            x="440"
                            y="555"
                            width="120"
                            height="24"
                            rx="5"
                            fill="#111827"
                            stroke={floorFilter === "first" ? "#526176" : "#22D3EE"}
                            strokeWidth="1.2"
                          />
                          <text
                            x="500"
                            y="571"
                            textAnchor="middle"
                            fill={floorFilter === "first" ? "#94A3B8" : "#22D3EE"}
                            fontSize="11"
                            fontWeight="800"
                            letterSpacing="0.06em"
                            fontFamily="system-ui, -apple-system, sans-serif"
                          >
                            MAIN GATE
                          </text>
                        </g>
                        {floorFilter === "first" && (
                          <text
                            x="500"
                            y="598"
                            textAnchor="middle"
                            fill="#94A3B8"
                            fontSize="9"
                            className="pointer-events-none select-none font-mono"
                          >
                            (GROUND ACCESS ONLY)
                          </text>
                        )}
                      </g>
                    </g>

                    {/* LAYER 3: BASE GRAPH EDGES LAYER */}
                    <g id="base-edges-layer">
                      {DEMO_EDGES.map((edge) => {
                        const fromNode = getNodeById(edge.from_node_id);
                        const toNode = getNodeById(edge.to_node_id);
                        if (!fromNode || !toNode) return null;

                        const isVisible =
                          visibleNodeIds.has(fromNode.id) && visibleNodeIds.has(toNode.id);
                        if (!isVisible && floorFilter !== "all") return null;

                        const p1 = transformCoordinates(fromNode.x, fromNode.y, fromNode.floor_id, fromNode.id);
                        const p2 = transformCoordinates(toNode.x, toNode.y, toNode.floor_id, toNode.id);

                        const isBlockedEdge = simulatedBlockedEdgeIds.includes(edge.id);
                        const isInspected = inspectedEdgeId === edge.id;
                        const isOneWay = !edge.bidirectional;

                        return (
                          <g key={edge.id}>
                            {/* Blocked edge warning halo */}
                            {isBlockedEdge && (
                              <line
                                x1={p1.svgX}
                                y1={p1.svgY}
                                x2={p2.svgX}
                                y2={p2.svgY}
                                stroke="#F87171"
                                strokeWidth={8}
                                strokeOpacity={0.25}
                              />
                            )}

                            {/* Base edge connection line */}
                            <line
                              x1={p1.svgX}
                              y1={p1.svgY}
                              x2={p2.svgX}
                              y2={p2.svgY}
                              stroke={
                                isBlockedEdge
                                  ? "#F87171"
                                  : isInspected
                                  ? "#22D3EE"
                                  : "#526176"
                              }
                              strokeWidth={isBlockedEdge ? 3.5 : isInspected ? 3.0 : 2.2}
                              strokeDasharray={
                                isBlockedEdge
                                  ? "6 4"
                                  : edge.edge_type === "staircase"
                                  ? "6 4"
                                  : isOneWay
                                  ? "8 4"
                                  : undefined
                              }
                              markerEnd={
                                isBlockedEdge
                                  ? undefined
                                  : isOneWay
                                  ? "url(#directed-arrow-dark)"
                                  : undefined
                              }
                              className="cursor-pointer transition-colors hover:stroke-cyan-400"
                              onClick={() => {
                                setInspectedEdgeId(edge.id);
                                setInspectedNodeId(null);
                              }}
                            />

                            {/* Blockage indicator marker */}
                            {isBlockedEdge && (
                              <g className="pointer-events-none select-none">
                                <circle
                                  cx={(p1.svgX + p2.svgX) / 2}
                                  cy={(p1.svgY + p2.svgY) / 2}
                                  r={8}
                                  fill="#111827"
                                  stroke="#F87171"
                                  strokeWidth={2}
                                />
                                <text
                                  x={(p1.svgX + p2.svgX) / 2}
                                  y={(p1.svgY + p2.svgY) / 2 + 4}
                                  textAnchor="middle"
                                  fill="#F87171"
                                  fontSize="11"
                                  fontWeight="bold"
                                  fontFamily="system-ui, sans-serif"
                                >
                                  ✕
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </g>

                    {/* LAYER 4 & 5: FULL CALCULATED ROUTE PATH LAYER (CRITICAL REQUIREMENT) */}
                    {/* Rendered ABOVE ordinary graph edges in SVG z-order */}
                    <g id="active-route-highlight-layer">
                      {fullRouteSegments.map((seg, idx) => (
                        <g key={`route-seg-${seg.fromId}-${seg.toId}-${idx}`}>
                          {/* Route outer glow halo */}
                          <line
                            x1={seg.p1.svgX}
                            y1={seg.p1.svgY}
                            x2={seg.p2.svgX}
                            y2={seg.p2.svgY}
                            stroke="#34D399"
                            strokeWidth={10}
                            strokeOpacity={seg.isHiddenByFilter ? 0.15 : 0.4}
                            filter="url(#route-glow-dark)"
                          />

                          {/* Route core stroke */}
                          <line
                            x1={seg.p1.svgX}
                            y1={seg.p1.svgY}
                            x2={seg.p2.svgX}
                            y2={seg.p2.svgY}
                            stroke="#34D399"
                            strokeWidth={4.5}
                            strokeOpacity={seg.isHiddenByFilter ? 0.35 : 1}
                            strokeDasharray={seg.isCrossFloor || seg.isHiddenByFilter ? "8 5" : undefined}
                            markerEnd={seg.isHiddenByFilter ? undefined : "url(#route-arrow-dark)"}
                            className="transition-all"
                          />

                          {/* Cross-floor transition badge (Requirement 4.5: STAIRS ↑ FIRST FLOOR / STAIRS ↓ GROUND FLOOR) */}
                          {seg.isCrossFloor && (
                            <g className="pointer-events-none select-none">
                              {(() => {
                                const isUp =
                                  (seg.fromNode.floor_name?.includes("Ground") || seg.fromNode.floor_id?.endsWith("1") || seg.fromNode.floor_id?.endsWith("3")) &&
                                  (seg.toNode.floor_name?.includes("First") || seg.toNode.floor_id?.endsWith("2") || seg.toNode.floor_id?.endsWith("4"));
                                const text = isUp ? "STAIRS ↑ FIRST FLOOR" : "STAIRS ↓ GROUND FLOOR";
                                const midX = (seg.p1.svgX + seg.p2.svgX) / 2;
                                const midY = (seg.p1.svgY + seg.p2.svgY) / 2;
                                return (
                                  <>
                                    <rect
                                      x={midX - 70}
                                      y={midY - 12}
                                      width={140}
                                      height={24}
                                      rx={5}
                                      fill="#111827"
                                      fillOpacity={0.96}
                                      stroke="#22D3EE"
                                      strokeWidth={1.5}
                                    />
                                    <text
                                      x={midX}
                                      y={midY + 4}
                                      textAnchor="middle"
                                      fill="#22D3EE"
                                      fontSize="10"
                                      fontWeight="bold"
                                      fontFamily="ui-monospace, monospace"
                                      letterSpacing="0.04em"
                                    >
                                      {text}
                                    </text>
                                  </>
                                );
                              })()}
                            </g>
                          )}
                        </g>
                      ))}
                    </g>

                    {/* LAYER 6: CAMPUS NODES LAYER */}
                    <g id="nodes-layer">
                      {visibleNodes.map((node) => {
                        const { svgX, svgY } = transformCoordinates(node.x, node.y, node.floor_id, node.id);
                        const isStart = startNodeId === node.id;
                        const isDestination = destinationNodeId === node.id;
                        const isPathNode = activePathNodeIds.includes(node.id);
                        const isInspected = inspectedNodeId === node.id;

                        // Semantic color palette tailored for dark theme
                        let nodeFill = "#526176";
                        const radius = getNodeRadius(node.node_type, node.is_exit, node.is_assembly_point);

                        if (node.is_assembly_point) {
                          nodeFill = "#FBBF24"; // amber gold
                        } else if (node.is_exit) {
                          nodeFill = "#34D399"; // safe emerald green
                        } else if (node.node_type === "entrance") {
                          nodeFill = "#22D3EE"; // cyan entrance
                        } else if (node.node_type === "staircase") {
                          nodeFill = "#94A3B8"; // lighter slate
                        } else if (node.node_type === "room") {
                          nodeFill = "#334155"; // deep slate room
                        } else if (node.node_type === "junction") {
                          nodeFill = "#64748B"; // junction stone
                        }

                        const labelBox = labelBoxes.get(node.id);
                        const badgeBox = badgeBoxes.get(node.id);
                        const compactLabel = getCompactNodeLabel(node.code);

                        return (
                          <g
                            key={node.id}
                            className="cursor-pointer group"
                            onClick={() => handleNodeClick(node)}
                          >
                            <title>{`${node.name} (${node.code})`}</title>

                            {/* Outer Highlight Ring for Route / Active Nodes */}
                            {(isStart || isDestination || isPathNode || isInspected) && (
                              <circle
                                cx={svgX}
                                cy={svgY}
                                r={radius + 6}
                                fill="none"
                                stroke={
                                  isStart
                                    ? "#34D399"
                                    : isDestination
                                    ? "#22D3EE"
                                    : isInspected
                                    ? "#FBBF24"
                                    : "#34D399"
                                }
                                strokeWidth={2.5}
                                strokeDasharray={isStart || isDestination ? "5 3" : undefined}
                                className={isStart || isDestination ? "animate-pulse" : undefined}
                              />
                            )}

                            {/* Node Main Circle */}
                            <circle
                              cx={svgX}
                              cy={svgY}
                              r={radius}
                              fill={nodeFill}
                              stroke={isStart ? "#34D399" : isDestination ? "#22D3EE" : "#111827"}
                              strokeWidth={isStart || isDestination ? 3 : 2}
                              className="transition-colors duration-150 group-hover:stroke-cyan-300"
                            />

                            {/* Node Compact Label Pill */}
                            {labelBox && (
                              <g className="pointer-events-none select-none">
                                <rect
                                  x={labelBox.x}
                                  y={labelBox.y}
                                  width={labelBox.width}
                                  height={labelBox.height}
                                  rx="4"
                                  fill="#111827"
                                  fillOpacity="0.96"
                                  stroke={
                                    isStart
                                      ? "#34D399"
                                      : isDestination
                                      ? "#22D3EE"
                                      : isPathNode
                                      ? "#34D399"
                                      : isInspected
                                      ? "#FBBF24"
                                      : "#263449"
                                  }
                                  strokeWidth={isStart || isDestination || isInspected || isPathNode ? 1.5 : 1.0}
                                />
                                <text
                                  x={labelBox.x + labelBox.width / 2}
                                  y={labelBox.y + labelBox.height / 2 + 3.8}
                                  textAnchor="middle"
                                  fontSize="11"
                                  fill={
                                    isStart
                                      ? "#34D399"
                                      : isDestination
                                      ? "#22D3EE"
                                      : isPathNode
                                      ? "#34D399"
                                      : isInspected
                                      ? "#FBBF24"
                                      : "#F1F5F9"
                                  }
                                  fontWeight={isStart || isDestination || isPathNode || isInspected ? "700" : "600"}
                                  fontFamily="ui-monospace, monospace"
                                >
                                  {compactLabel}
                                </text>
                              </g>
                            )}

                            {/* Distinct START Badge Marker */}
                            {isStart && badgeBox && (
                              <g className="pointer-events-none select-none">
                                <rect
                                  x={badgeBox.x}
                                  y={badgeBox.y}
                                  width={badgeBox.width}
                                  height={badgeBox.height}
                                  rx="4"
                                  fill="#064E3B"
                                  stroke="#34D399"
                                  strokeWidth="1.5"
                                />
                                <text
                                  x={badgeBox.x + badgeBox.width / 2}
                                  y={badgeBox.y + badgeBox.height / 2 + 3.5}
                                  textAnchor="middle"
                                  fontSize="10"
                                  fill="#34D399"
                                  fontWeight="bold"
                                  fontFamily="ui-monospace, monospace"
                                >
                                  START
                                </text>
                              </g>
                            )}

                            {/* Distinct DEST Badge Marker */}
                            {isDestination && strategy !== "evacuation" && badgeBox && (
                              <g className="pointer-events-none select-none">
                                <rect
                                  x={badgeBox.x}
                                  y={badgeBox.y}
                                  width={badgeBox.width}
                                  height={badgeBox.height}
                                  rx="4"
                                  fill="#164E63"
                                  stroke="#22D3EE"
                                  strokeWidth="1.5"
                                />
                                <text
                                  x={badgeBox.x + badgeBox.width / 2}
                                  y={badgeBox.y + badgeBox.height / 2 + 3.5}
                                  textAnchor="middle"
                                  fontSize="10"
                                  fill="#22D3EE"
                                  fontWeight="bold"
                                  fontFamily="ui-monospace, monospace"
                                >
                                  DEST
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  </g>
                </svg>
              </div>

              {/* READABLE DARK THEME MAP LEGEND */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#263449] bg-[#0B1120] p-3 text-xs">
                <div className="flex flex-wrap items-center gap-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#34D399] border border-[#111827] shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                    <span className="text-[#94A3B8]">Emergency Exit</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#22D3EE] border border-[#111827]" />
                    <span className="text-[#94A3B8]">Building Entrance</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FBBF24] border border-[#111827]" />
                    <span className="text-[#94A3B8]">Assembly Grounds</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#94A3B8] border border-[#111827]" />
                    <span className="text-[#94A3B8]">Staircase</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#334155] border border-[#263449]" />
                    <span className="text-[#94A3B8]">Room</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-4 rounded-full bg-[#34D399] shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    <span className="text-emerald-300 font-medium">Calculated Route</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1 w-4 rounded-full bg-[#F87171]" />
                    <span className="text-red-300 font-medium">Blocked Edge</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-0.5 w-3.5 bg-[#526176]" />
                    <span className="text-[#94A3B8]">Standard Arc</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* INSPECTION DRAWER / DETAILS CARD */}
          {(inspectedNode || inspectedEdge) && (
            <Card className="border border-[#263449] bg-[#111827] shadow-lg">
              <CardContent className="p-4">
                {inspectedNode && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs border-cyan-500/30 bg-cyan-950/40 text-cyan-300">
                          {inspectedNode.node_type.toUpperCase()}
                        </Badge>
                        <h4 className="font-semibold text-[#F1F5F9]">{inspectedNode.name}</h4>
                        <span className="text-xs text-[#94A3B8] font-mono">({inspectedNode.code})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-[#263449] bg-[#172033] hover:bg-[#1E293B] text-[#F1F5F9]"
                          onClick={() => handleSetStart(inspectedNode.id)}
                        >
                          Set as Start
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-cyan-500/30 bg-cyan-950/40 hover:bg-cyan-950/70 text-cyan-300"
                          onClick={() => handleSetDestination(inspectedNode.id)}
                        >
                          Set as Destination
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                      <div>
                        <span className="text-[#94A3B8]">Building:</span>
                        <p className="font-medium text-[#F1F5F9]">{inspectedNode.building_name}</p>
                      </div>
                      <div>
                        <span className="text-[#94A3B8]">Floor:</span>
                        <p className="font-medium text-[#F1F5F9]">{inspectedNode.floor_name}</p>
                      </div>
                      <div>
                        <span className="text-[#94A3B8]">Coordinates:</span>
                        <p className="font-mono text-[#F1F5F9]">({inspectedNode.x}, {inspectedNode.y})</p>
                      </div>
                      <div>
                        <span className="text-[#94A3B8]">Capacity:</span>
                        <p className="font-medium text-[#F1F5F9]">{inspectedNode.capacity} people</p>
                      </div>
                    </div>
                  </div>
                )}

                {inspectedEdge && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs border-[#263449] bg-[#172033] text-cyan-300">
                          EDGE ({inspectedEdge.edge_type.toUpperCase()})
                        </Badge>
                        <span className="font-mono text-xs text-[#94A3B8] truncate">{inspectedEdge.id}</span>
                      </div>
                      <Badge
                        variant="secondary"
                        className={
                          inspectedEdge.bidirectional
                            ? "bg-emerald-950/60 text-emerald-300 border border-emerald-500/20"
                            : "bg-slate-800 text-slate-300"
                        }
                      >
                        {inspectedEdge.bidirectional ? "Bidirectional" : "One-Way Directed"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                      <div>
                        <span className="text-[#94A3B8]">From Node:</span>
                        <p className="font-medium text-[#F1F5F9]">
                          {getNodeById(inspectedEdge.from_node_id)?.name || "Unknown"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[#94A3B8]">To Node:</span>
                        <p className="font-medium text-[#F1F5F9]">
                          {getNodeById(inspectedEdge.to_node_id)?.name || "Unknown"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[#94A3B8]">Distance:</span>
                        <p className="font-mono font-medium text-emerald-400">{inspectedEdge.distance} metres</p>
                      </div>
                      <div>
                        <span className="text-[#94A3B8]">Base Speed / Cap:</span>
                        <p className="font-mono text-[#F1F5F9]">
                          {inspectedEdge.base_speed} m/s · {inspectedEdge.base_capacity} ppl
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* REGION C: RIGHT RESULTS & DIAGNOSTICS PANEL (3 cols on lg) */}
        <div className="flex flex-col gap-5 lg:col-span-3">
          {/* Active Route Telemetry Card */}
          <Card className="border border-[#263449] bg-[#111827] shadow-lg">
            <CardHeader className="border-b border-[#263449] pb-3 pt-4 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-[#F1F5F9]">
                Route Telemetry
              </CardTitle>

              {/* Status Badge Formatter */}
              {strategy === "evacuation" ? (
                evacuationResult?.status === "no_route" ? (
                  <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-950/60 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-red-300">
                    No Exit Reachable
                  </span>
                ) : evacuationResult?.blocked_edge_count && evacuationResult.blocked_edge_count > 0 ? (
                  <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-950/60 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-amber-300">
                    Alternate Route Selected
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-emerald-300">
                    Active Path
                  </span>
                )
              ) : strategy === "emergency" && emergencyResult?.blocked_edge_count && emergencyResult.blocked_edge_count > 0 ? (
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-950/60 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-amber-300">
                  Alternate Route Selected
                </span>
              ) : activePathNodeIds.length > 0 ? (
                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-emerald-300">
                  Active Path
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-[#263449] bg-[#172033] px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-[#94A3B8]">
                  Idle
                </span>
              )}
            </CardHeader>

            <CardContent className="flex flex-col gap-4 p-4 text-xs">
              {/* Distance / Route Cost Metric (Labeled Accurately) */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-lg border border-[#263449] bg-[#172033] p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    Route Cost
                  </span>
                  <p className="mt-1 text-2xl font-bold font-mono tracking-tight text-emerald-400">
                    {strategy === "evacuation" ? (
                      evacuationResult?.status === "route_found" &&
                      evacuationResult.total_distance_m !== null &&
                      evacuationResult.total_distance_m !== undefined ? (
                        <>
                          {evacuationResult.total_distance_m.toFixed(1)}
                          <span className="text-xs font-normal text-[#94A3B8] ml-1">m</span>
                        </>
                      ) : (
                        "—"
                      )
                    ) : strategy === "emergency" ? (
                      emergencyResult?.total_distance_m !== null && emergencyResult?.total_distance_m !== undefined ? (
                        <>
                          {emergencyResult.total_distance_m.toFixed(1)}
                          <span className="text-xs font-normal text-[#94A3B8] ml-1">m</span>
                        </>
                      ) : (
                        "—"
                      )
                    ) : strategy === "congestion" ? (
                      congestionResult?.total_distance_m !== null && congestionResult?.total_distance_m !== undefined ? (
                        <>
                          {congestionResult.total_distance_m.toFixed(1)}
                          <span className="text-xs font-normal text-[#94A3B8] ml-1">m</span>
                        </>
                      ) : (
                        "—"
                      )
                    ) : strategy === "prediction" ? (
                      predictionResult?.route_distance_m !== null && predictionResult?.route_distance_m !== undefined ? (
                        <>
                          {predictionResult.route_distance_m.toFixed(1)}
                          <span className="text-xs font-normal text-[#94A3B8] ml-1">m</span>
                        </>
                      ) : shortestResult?.total_distance_m !== null && shortestResult?.total_distance_m !== undefined ? (
                        <>
                          {shortestResult.total_distance_m.toFixed(1)}
                          <span className="text-xs font-normal text-[#94A3B8] ml-1">m</span>
                        </>
                      ) : (
                        "—"
                      )
                    ) : shortestResult?.total_distance_m !== null && shortestResult?.total_distance_m !== undefined ? (
                      <>
                        {shortestResult.total_distance_m.toFixed(1)}
                        <span className="text-xs font-normal text-[#94A3B8] ml-1">m</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>

                <div className="rounded-lg border border-[#263449] bg-[#172033] p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    Est. Duration
                  </span>
                  {congestionResult ? (
                    <p className="mt-1 text-2xl font-bold font-mono tracking-tight text-cyan-400">
                      {congestionResult.estimated_travel_time_s.toFixed(1)}s
                    </p>
                  ) : predictionResult ? (
                    <p className="mt-1 text-2xl font-bold font-mono tracking-tight text-cyan-400">
                      {predictionResult.predicted_travel_time_s.toFixed(1)}s
                    </p>
                  ) : strategy === "prediction" && shortestResult ? (
                    <div className="mt-1">
                      <p className="text-xs font-semibold text-amber-400">Model Unavailable</p>
                      <p className="text-[10px] text-[#94A3B8] leading-tight mt-0.5">Physical path active</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs font-medium text-[#94A3B8] italic">
                      Distance only
                    </p>
                  )}
                </div>
              </div>

              {/* Before/After Hazard Comparison Notice */}
              {baselineDistance !== null &&
                hazardPreset !== "none" &&
                shortestResult?.total_distance_m !== undefined &&
                shortestResult.total_distance_m !== null && (
                  <div className="rounded border border-amber-500/30 bg-amber-950/30 p-2 text-[11px] text-amber-200">
                    <span className="font-semibold">Hazard Impact: </span>
                    Path rerouted from {baselineDistance.toFixed(1)}m to {shortestResult.total_distance_m.toFixed(1)}m (+{(shortestResult.total_distance_m - baselineDistance).toFixed(1)}m detour)
                  </div>
                )}

              {/* Cross-Floor Staircase Transition Indicators (Requirement 4.5) */}
              {floorTransitions.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-cyan-500/40 bg-cyan-950/40 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
                    <Layers className="h-3.5 w-3.5" />
                    <span>Floor Transitions ({floorTransitions.length})</span>
                  </div>
                  {floorTransitions.map((t, idx) => (
                    <div
                      key={`floor-trans-stat-${idx}`}
                      className="flex items-center justify-between rounded bg-[#111827] p-2 text-xs border border-[#263449]"
                    >
                      <span className="font-mono font-bold text-cyan-400">{t.indicator}</span>
                      <span className="font-mono text-[10px] text-[#94A3B8]">
                        {t.fromNode.code} → {t.toNode.code}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Copy Route Summary Button */}
              {activePathNodeIds.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopySummary}
                  className="w-full gap-1.5 border-[#263449] bg-[#172033] hover:bg-[#1E293B] text-xs text-[#F1F5F9]"
                >
                  {copiedSummary ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Copy Route Summary</span>
                    </>
                  )}
                </Button>
              )}

              {/* Evacuation Evaluation Callout */}
              {strategy === "evacuation" && evacuationResult && (
                <div
                  className={`rounded-lg border p-3 ${
                    evacuationResult.status === "no_route"
                      ? "border-red-500/40 bg-red-950/40 text-red-200"
                      : evacuationResult.blocked_edge_count && evacuationResult.blocked_edge_count > 0
                      ? "border-amber-500/30 bg-amber-950/40 text-amber-200"
                      : "border-emerald-500/30 bg-emerald-950/40 text-emerald-200"
                  }`}
                >
                  <div
                    className={`font-semibold ${
                      evacuationResult.status === "no_route"
                        ? "text-red-400"
                        : evacuationResult.blocked_edge_count && evacuationResult.blocked_edge_count > 0
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {evacuationResult.status === "no_route"
                      ? "No Reachable Exit Available"
                      : evacuationResult.blocked_edge_count && evacuationResult.blocked_edge_count > 0
                      ? `Alternate Exit Selected: ${evacuationResult.selected_exit_name || "None"}`
                      : `Selected Exit: ${evacuationResult.selected_exit_name || "None"}`}
                  </div>
                  <p className="mt-1 text-[11px] text-[#94A3B8] leading-relaxed">
                    {evacuationResult.status === "no_route"
                      ? "All candidate exits are currently unreachable or blocked under active hazard conditions. No valid path exists."
                      : evacuationResult.blocked_edge_count && evacuationResult.blocked_edge_count > 0
                      ? `Hazard avoidance active: ${evacuationResult.blocked_edge_count} blocked edge(s) avoided. Route recalculated to nearest reachable exit.`
                      : `Objective: ${evacuationResult.selection_objective}`}
                  </p>
                  <div className="mt-2 flex flex-col gap-1 border-t border-[#263449] pt-2">
                    <span className="font-semibold text-[#F1F5F9]">Candidate Exit Evaluation:</span>
                    {evacuationResult.evaluated_exits.map((ex) => (
                      <div key={ex.exit_id} className="flex items-center justify-between text-[11px]">
                        <span className="text-[#94A3B8] truncate">{ex.name}</span>
                        <span
                          className={
                            ex.reachable
                              ? "font-mono font-semibold text-emerald-400"
                              : "font-mono text-red-400"
                          }
                        >
                          {ex.reachable ? `${ex.distance_m?.toFixed(1)}m` : `Excluded`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Waypoint Path Sequence */}
              {activePathNodeIds.length > 0 && (
                <div>
                  <span className="font-semibold text-[#F1F5F9] block mb-1.5">
                    Ordered Route Nodes ({activePathNodeIds.length} Nodes)
                  </span>
                  <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
                    {activePathNodeIds.map((id, index) => {
                      const node = getNodeById(id);
                      return (
                        <React.Fragment key={`seq-${id}-${index}`}>
                          <span
                            onClick={() => handleNodeClick(node!)}
                            className="cursor-pointer rounded border border-[#263449] bg-[#172033] px-1.5 py-0.5 text-cyan-300 hover:border-cyan-400 hover:bg-[#1E293B] transition-colors"
                          >
                            {node?.code || id.slice(0, 8)}
                          </span>
                          {index < activePathNodeIds.length - 1 && (
                            <ArrowRight className="h-2.5 w-2.5 text-[#526176]" />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Segment Breakdown Table */}
              {activePathNodeIds.length > 1 && (
                <div>
                  <span className="font-semibold text-[#F1F5F9] block mb-1.5">
                    Consecutive Arc Breakdown
                  </span>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-[#263449]">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-[#172033] font-semibold text-[#94A3B8] sticky top-0 border-b border-[#263449]">
                        <tr>
                          <th className="p-1.5">#</th>
                          <th className="p-1.5">Segment</th>
                          <th className="p-1.5 text-right">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#263449]">
                        {fullRouteSegments.map((seg, idx) => (
                          <tr key={`seg-row-${idx}`} className="hover:bg-[#172033] transition-colors">
                            <td className="p-1.5 font-mono text-[#94A3B8]">{idx + 1}</td>
                            <td className="p-1.5 font-mono text-[#F1F5F9]">
                              {seg.fromNode.code} → {seg.toNode.code}
                              {seg.isCrossFloor && (
                                <span className="ml-1 text-[9px] text-cyan-400 font-sans">
                                  (Stairs)
                                </span>
                              )}
                            </td>
                            <td className="p-1.5 text-right font-mono font-semibold text-emerald-400">
                              {seg.distance !== undefined ? `${seg.distance}m` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Authoritative Campus Graph Diagnostics */}
          <Card className="border border-[#263449] bg-[#111827] shadow-lg">
            <CardHeader className="border-b border-[#263449] pb-2.5 pt-3 px-4">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                Authoritative Graph Diagnostics
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 text-xs">
              <div className="grid grid-cols-2 gap-2 font-mono">
                <div className="rounded border border-[#263449] bg-[#172033] p-2 text-center">
                  <span className="text-[10px] text-[#94A3B8] uppercase block">Nodes</span>
                  <span className="text-base font-bold text-[#F1F5F9]">
                    {graphSummary?.node_count || DEMO_NODES.length}
                  </span>
                </div>
                <div className="rounded border border-[#263449] bg-[#172033] p-2 text-center">
                  <span className="text-[10px] text-[#94A3B8] uppercase block">Edges</span>
                  <span className="text-base font-bold text-[#F1F5F9]">
                    {graphSummary?.edge_count || DEMO_EDGES.length}
                  </span>
                </div>
                <div className="rounded border border-[#263449] bg-[#172033] p-2 text-center">
                  <span className="text-[10px] text-[#94A3B8] uppercase block">Arcs</span>
                  <span className="text-base font-bold text-[#F1F5F9]">
                    {graphSummary?.arc_count || 39}
                  </span>
                </div>
                <div className="rounded border border-[#263449] bg-[#172033] p-2 text-center">
                  <span className="text-[10px] text-[#94A3B8] uppercase block">Exits</span>
                  <span className="text-base font-bold text-emerald-400">
                    {graphSummary?.exit_count || 3}
                  </span>
                </div>
              </div>
              <p className="mt-2.5 text-[11px] text-[#94A3B8]">
                MultiDiGraph topology · Edge 21 Active Walkway · 1 Assembly Point
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
