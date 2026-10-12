"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  DEMO_CAMPUS_ID,
  DEMO_CAMPUS_NAME,
  DEMO_NODES,
  DEMO_EDGES,
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
  Flame,
  Clock,
  Cpu,
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
} from "@/lib/map-layout";

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
  const dragStartRef = React.useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const handleZoomIn = () => setZoom((prev) => Math.min(2.5, Number((prev + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.75, Number((prev - 0.25).toFixed(2))));
  const handleResetZoomPan = () => {
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

  // Active in-flight request tracker to prevent stale responses from overwriting newer scenarios
  const activeRequestIdRef = React.useRef<number>(0);

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
      return predictionResult?.path_node_ids || [];
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
      return predictionResult?.edge_ids || [];
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
    overrideStartNodeId?: string
  ) => {
    const requestId = ++activeRequestIdRef.current;
    setRouteLoading(true);
    setRouteError(null);

    const activeStrategy = overrideStrategy ?? strategy;
    const activeStartNode = overrideStartNodeId ?? startNodeId;
    const activePreset = overrideHazardPreset ?? hazardPreset;

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
      if (activeStrategy === "shortest") {
        const res = await getShortestRoute(campusId, {
          start_node_id: activeStartNode,
          destination_node_id: destinationNodeId,
          blocked_edge_ids: blockedEdges,
        });
        if (requestId !== activeRequestIdRef.current) return;
        setShortestResult(res);
      } else if (activeStrategy === "astar") {
        const res = await getAstarRoute(campusId, {
          start_node_id: activeStartNode,
          destination_node_id: destinationNodeId,
          blocked_edge_ids: blockedEdges,
        });
        if (requestId !== activeRequestIdRef.current) return;
        setShortestResult(res);
      } else if (activeStrategy === "emergency") {
        const res = await getEmergencyAwareRoute(campusId, {
          start_node_id: activeStartNode,
          destination_node_id: destinationNodeId,
          blocked_edge_ids: blockedEdges,
        });
        if (requestId !== activeRequestIdRef.current) return;
        setEmergencyResult(res);
      } else if (activeStrategy === "evacuation") {
        const res = await getEvacuationRoute(campusId, {
          start_node_id: activeStartNode,
          blocked_edge_ids: blockedEdges,
        });
        if (requestId !== activeRequestIdRef.current) return;
        setEvacuationResult(res);
      } else if (activeStrategy === "congestion") {
        const res = await getCongestionRoute(campusId, {
          start_node_id: activeStartNode,
          destination_node_id: destinationNodeId,
          base_walking_speed_mps: walkingSpeed,
          edge_scenarios: edgeScenarios,
        });
        if (requestId !== activeRequestIdRef.current) return;
        setCongestionResult(res);
      } else if (activeStrategy === "prediction") {
        // Step 1: obtain traversable path via baseline shortest route first
        const baseRoute = await getShortestRoute(campusId, {
          start_node_id: activeStartNode,
          destination_node_id: destinationNodeId,
          blocked_edge_ids: blockedEdges,
        });
        if (requestId !== activeRequestIdRef.current) return;
        setShortestResult(baseRoute);

        // Step 2: predict travel time along this route
        const edgeIds = baseRoute.steps.map((s) => s.edge_id);
        const predRes = await predictRouteTime(campusId, {
          path_node_ids: baseRoute.path_node_ids,
          edge_ids: edgeIds,
          base_walking_speed_mps: walkingSpeed,
          edge_scenarios: edgeScenarios,
        });
        if (requestId !== activeRequestIdRef.current) return;
        setPredictionResult(predRes);
      }
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

  // SVG coordinate transformation
  // Raw seed coordinates: x: 0..77, y: -4..20
  // Canvas bounds: x: -10..88, y: -10..26
  // Invert y so positive y (e.g. assembly point y=20) appears towards top
  const transformCoordinates = useCallback(
    (x: number, y: number, floorId: string | null) => {
      // In schematic view, offset First Floor nodes slightly upwards to differentiate identical planar locations
      let yOffset = 0;
      if (floorFilter === "all" && floorId?.endsWith("2") || floorId?.endsWith("4")) {
        // First floor node
        yOffset = -3.2;
      }
      const svgX = x + 8;
      const svgY = 24 - (y + yOffset);
      return { svgX, svgY };
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

  const inspectedNode = inspectedNodeId ? getNodeById(inspectedNodeId) : null;
  const inspectedEdge = inspectedEdgeId
    ? DEMO_EDGES.find((e) => e.id === inspectedEdgeId)
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner & Status */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-[#DFDFD4] bg-[#FFFFFF] p-4 text-xs text-[#1A1D14] shadow-xs">
        <div className="flex items-center gap-2 font-semibold text-[#1A1D14]">
          <Info className="h-4 w-4 shrink-0 text-[#B77A26]" />
          <span>Authoritative Schematic Topology & Model Governance</span>
        </div>
        <p className="leading-relaxed text-[#686B60]">
          Visualized coordinates are local schematic representations from repository seed data. Physical routing uses exact graph weights. Machine-learning travel-time predictions are derived from synthetic training scenarios and are not calibrated against real-world evacuation measurements.
        </p>
      </div>

      {/* Main Grid: Map Visualizer on Left/Top, Route Controls on Right/Bottom */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* MAP VISUALIZATION CANVAS (8 cols) */}
        <div className="flex flex-col gap-4 lg:col-span-8">
          <Card className="overflow-hidden border border-[#DFDFD4] bg-[#FFFFFF] shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between border-b border-[#DFDFD4] pb-3 pt-4 px-5">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#1A1D14]">
                  <Navigation className="h-4 w-4 text-[#57603A]" />
                  Campus Topology Visualizer
                </CardTitle>
                <CardDescription className="text-xs text-[#686B60]">
                  {DEMO_CAMPUS_NAME} · {DEMO_NODES.length} Nodes · {DEMO_EDGES.length} Stored Edges · 3 Exits · 1 Assembly Point
                </CardDescription>
              </div>

              {/* Floor Filters */}
              <div className="flex items-center gap-1 rounded-lg border border-[#DFDFD4] bg-[#FAF9F5] p-1">
                <button
                  type="button"
                  onClick={() => setFloorFilter("all")}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                    floorFilter === "all"
                      ? "bg-[#57603A] text-white shadow-xs"
                      : "text-[#46483E] hover:text-[#1A1D14] hover:bg-[#EEEDE5]"
                  }`}
                >
                  All Floors
                </button>
                <button
                  type="button"
                  onClick={() => setFloorFilter("ground")}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                    floorFilter === "ground"
                      ? "bg-[#57603A] text-white shadow-xs"
                      : "text-[#46483E] hover:text-[#1A1D14] hover:bg-[#EEEDE5]"
                  }`}
                >
                  Ground Floor
                </button>
                <button
                  type="button"
                  onClick={() => setFloorFilter("first")}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                    floorFilter === "first"
                      ? "bg-[#57603A] text-white shadow-xs"
                      : "text-[#46483E] hover:text-[#1A1D14] hover:bg-[#EEEDE5]"
                  }`}
                >
                  First Floor
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-4">
              {/* SVG Canvas Area with Extended Viewing Space & Zoom/Pan */}
              <div className="relative h-[490px] sm:h-[550px] md:h-[610px] w-full overflow-hidden rounded-xl border border-[#DFDFD4] bg-[#F5F4EE] shadow-inner select-none">
                {/* Floating Zoom & Pan Controls */}
                <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-[#DFDFD4] bg-[#FFFFFF]/90 p-1 backdrop-blur-md shadow-xs">
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    aria-label="Zoom in"
                    className="rounded p-1.5 text-[#46483E] hover:bg-[#EEEDE5] hover:text-[#1A1D14] transition-colors"
                    title="Zoom In (+)"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <span className="px-1 text-[11px] font-mono text-[#686B60] select-none min-w-[36px] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    aria-label="Zoom out"
                    className="rounded p-1.5 text-[#46483E] hover:bg-[#EEEDE5] hover:text-[#1A1D14] transition-colors"
                    title="Zoom Out (-)"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <div className="h-4 w-[1px] bg-[#DFDFD4] mx-0.5" />
                  <button
                    type="button"
                    onClick={handleResetZoomPan}
                    aria-label="Reset view"
                    className="rounded p-1.5 text-[#46483E] hover:bg-[#EEEDE5] hover:text-[#1A1D14] transition-colors"
                    title="Reset View"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>

                {/* Navigation Hint */}
                <div className="absolute bottom-2 left-3 pointer-events-none text-[10px] text-[#686B60] font-mono z-10">
                  Scroll / drag to explore · Click nodes to inspect
                </div>

                <svg
                  viewBox="-6 -5 106 43"
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
                    const dx = ((e.clientX - dragStartRef.current.x) * 0.14) / zoom;
                    const dy = ((e.clientY - dragStartRef.current.y) * 0.14) / zoom;
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
                    {/* Architectural CAD Blueprint Grid Pattern */}
                    <pattern
                      id="campus-cad-grid"
                      width="4"
                      height="4"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 4 0 L 0 0 0 4"
                        fill="none"
                        stroke="#E2E4D6"
                        strokeWidth="0.08"
                      />
                    </pattern>
                    {/* Marker for directed edges (outdoor paths) */}
                    <marker
                      id="directed-arrow"
                      viewBox="0 0 10 10"
                      refX="14"
                      refY="5"
                      markerWidth="4"
                      markerHeight="4"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 9 5 L 0 9 z" fill="#57603A" />
                    </marker>
                    {/* Marker for route path arrows */}
                    <marker
                      id="route-arrow"
                      viewBox="0 0 10 10"
                      refX="14"
                      refY="5"
                      markerWidth="5"
                      markerHeight="5"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 9 5 L 0 9 z" fill="#3C6849" />
                    </marker>
                    {/* Subtle route glow filter */}
                    <filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="0.4" result="blur" />
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
                      transformOrigin: "47px 17px",
                      transition: isDragging ? "none" : "transform 0.12s ease-out",
                    }}
                  >
                    {/* Architectural Background Grid Rect */}
                    <rect
                      x="-6"
                      y="-5"
                      width="106"
                      height="43"
                      fill="url(#campus-cad-grid)"
                    />

                    {/* Building Zone Background Boundaries (Schematic) */}
                    <g>
                      {/* Administration Building Zone Rect */}
                      <rect
                        x="4"
                        y="16.5"
                        width="34"
                        height="17"
                        rx="2"
                        fill="#FFFFFF"
                        fillOpacity="0.88"
                        stroke="#C7C7BA"
                        strokeWidth="0.35"
                        strokeDasharray="1.5 1"
                      />

                      {/* Academic Building Zone Rect */}
                      <rect
                        x="54"
                        y="16.5"
                        width="35"
                        height="17"
                        rx="2"
                        fill="#FFFFFF"
                        fillOpacity="0.88"
                        stroke="#C7C7BA"
                        strokeWidth="0.35"
                        strokeDasharray="1.5 1"
                      />

                      {/* Central Courtyard / Walkway Zone Rect */}
                      <rect
                        x="39"
                        y="0.5"
                        width="20"
                        height="14"
                        rx="2"
                        fill="#EEEDE5"
                        fillOpacity="0.65"
                        stroke="#B77A26"
                        strokeOpacity="0.4"
                        strokeWidth="0.35"
                        strokeDasharray="1.5 1"
                      />

                      {/* Building Header Badges */}
                      {/* Administration Building Header */}
                      <g className="pointer-events-none select-none">
                        <rect
                          x="5"
                          y="14.2"
                          width="24"
                          height="3.2"
                          rx="0.8"
                          fill="#FFFFFF"
                          stroke="#DFDFD4"
                          strokeWidth="0.35"
                        />
                        <text
                          x="17"
                          y="16.35"
                          textAnchor="middle"
                          fill="#1A1D14"
                          fontSize="1.3"
                          fontWeight="700"
                          letterSpacing="0.05em"
                          fontFamily="system-ui, -apple-system, sans-serif"
                        >
                          ADMINISTRATION BLDG
                        </text>
                      </g>

                      {/* Academic Building Header */}
                      <g className="pointer-events-none select-none">
                        <rect
                          x="55"
                          y="14.2"
                          width="21"
                          height="3.2"
                          rx="0.8"
                          fill="#FFFFFF"
                          stroke="#DFDFD4"
                          strokeWidth="0.35"
                        />
                        <text
                          x="65.5"
                          y="16.35"
                          textAnchor="middle"
                          fill="#1A1D14"
                          fontSize="1.3"
                          fontWeight="700"
                          letterSpacing="0.05em"
                          fontFamily="system-ui, -apple-system, sans-serif"
                        >
                          ACADEMIC BLDG
                        </text>
                      </g>

                      {/* Assembly Grounds Header */}
                      <g className="pointer-events-none select-none">
                        <rect
                          x="40"
                          y="-1.2"
                          width="18"
                          height="3"
                          rx="0.8"
                          fill="#FFFFFF"
                          stroke="#DFDFD4"
                          strokeWidth="0.35"
                        />
                        <text
                          x="49"
                          y="0.8"
                          textAnchor="middle"
                          fill="#7A4F13"
                          fontSize="1.2"
                          fontWeight="700"
                          letterSpacing="0.05em"
                          fontFamily="system-ui, -apple-system, sans-serif"
                        >
                          ASSEMBLY GROUNDS
                        </text>
                      </g>
                    </g>

                  {/* EDGES LAYER */}
                  <g>
                    {DEMO_EDGES.map((edge) => {
                      const fromNode = getNodeById(edge.from_node_id);
                      const toNode = getNodeById(edge.to_node_id);
                      if (!fromNode || !toNode) return null;

                      const isVisible =
                        visibleNodeIds.has(fromNode.id) && visibleNodeIds.has(toNode.id);
                      if (!isVisible && floorFilter !== "all") return null;

                      const p1 = transformCoordinates(fromNode.x, fromNode.y, fromNode.floor_id);
                      const p2 = transformCoordinates(toNode.x, toNode.y, toNode.floor_id);

                      const isPathEdge = activePathEdgeIds.includes(edge.id);
                      const isBlockedEdge = simulatedBlockedEdgeIds.includes(edge.id);
                      const isInspected = inspectedEdgeId === edge.id;
                      const isOneWay = !edge.bidirectional;

                      return (
                        <g key={edge.id}>
                          {/* Route halo underlay */}
                          {isPathEdge && (
                            <line
                              x1={p1.svgX}
                              y1={p1.svgY}
                              x2={p2.svgX}
                              y2={p2.svgY}
                              stroke="#BDEEC7"
                              strokeWidth={2.6}
                              strokeOpacity={0.7}
                            />
                          )}

                          {/* Hazard blockage underlay */}
                          {isBlockedEdge && (
                            <line
                              x1={p1.svgX}
                              y1={p1.svgY}
                              x2={p2.svgX}
                              y2={p2.svgY}
                              stroke="#FDF2F0"
                              strokeWidth={2.6}
                              strokeOpacity={0.9}
                            />
                          )}

                          {/* Base edge line */}
                          <line
                            x1={p1.svgX}
                            y1={p1.svgY}
                            x2={p2.svgX}
                            y2={p2.svgY}
                            stroke={
                              isBlockedEdge
                                ? "#BA1A1A"
                                : isPathEdge
                                ? "#3C6849"
                                : isInspected
                                ? "#B77A26"
                                : isOneWay
                                ? "#57603A"
                                : "#C7C7BA"
                            }
                            strokeWidth={isBlockedEdge ? 1.4 : isPathEdge ? 1.3 : isInspected ? 1.0 : 0.6}
                            strokeDasharray={
                              isBlockedEdge
                                ? "1.2 0.8"
                                : edge.edge_type === "staircase"
                                ? "1.2 0.8"
                                : isOneWay && !isPathEdge
                                ? "2 1"
                                : undefined
                            }
                            markerEnd={
                              isBlockedEdge
                                ? undefined
                                : isPathEdge
                                ? "url(#route-arrow)"
                                : isOneWay
                                ? "url(#directed-arrow)"
                                : undefined
                            }
                            filter={isPathEdge ? "url(#route-glow)" : undefined}
                            className="cursor-pointer transition-colors hover:stroke-[#57603A]"
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
                                r={1.0}
                                fill="#FFFFFF"
                                stroke="#BA1A1A"
                                strokeWidth={0.3}
                              />
                              <text
                                x={(p1.svgX + p2.svgX) / 2}
                                y={(p1.svgY + p2.svgY) / 2 + 0.35}
                                textAnchor="middle"
                                fill="#BA1A1A"
                                fontSize="0.9"
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

                  {/* NODES LAYER */}
                  <g>
                    {visibleNodes.map((node) => {
                      const { svgX, svgY } = transformCoordinates(node.x, node.y, node.floor_id);
                      const isStart = startNodeId === node.id;
                      const isDestination = destinationNodeId === node.id;
                      const isPathNode = activePathNodeIds.includes(node.id);
                      const isInspected = inspectedNodeId === node.id;

                      // Semantic color palette tailored for Stitch enterprise
                      let nodeFill = "#686B60"; // default charcoal stone
                      let radius = 1.6;

                      if (node.is_assembly_point) {
                        nodeFill = "#B77A26"; // amber gold
                        radius = 2.4;
                      } else if (node.is_exit) {
                        nodeFill = "#3C6849"; // forest operational green
                        radius = 2.2;
                      } else if (node.node_type === "entrance") {
                        nodeFill = "#57603A"; // primary olive
                        radius = 2.0;
                      } else if (node.node_type === "staircase") {
                        nodeFill = "#686B60"; // medium slate/charcoal
                        radius = 1.8;
                      } else if (node.node_type === "room") {
                        nodeFill = "#46483E"; // dark charcoal
                        radius = 1.7;
                      } else if (node.node_type === "junction") {
                        nodeFill = "#686B60"; // junction stone
                        radius = 1.6;
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

                          {/* Outer highlight halo */}
                          {(isStart || isDestination || isPathNode || isInspected) && (
                            <circle
                              cx={svgX}
                              cy={svgY}
                              r={radius + 1.2}
                              fill="none"
                              stroke={
                                isStart
                                  ? "#1A1D14"
                                  : isDestination
                                  ? "#3C6849"
                                  : isInspected
                                  ? "#B77A26"
                                  : "#3C6849"
                              }
                              strokeWidth={0.5}
                              strokeDasharray={isStart || isDestination ? "1.5 1" : undefined}
                              className={isStart || isDestination ? "animate-pulse" : undefined}
                            />
                          )}

                          {/* Node Main Circle */}
                          <circle
                            cx={svgX}
                            cy={svgY}
                            r={radius}
                            fill={nodeFill}
                            stroke="#FFFFFF"
                            strokeWidth={isStart || isDestination ? 0.8 : 0.45}
                            className="transition-colors duration-150 group-hover:stroke-[#1A1D14]"
                          />

                          {/* Node Compact Label Pill */}
                          {labelBox && (
                            <g className="pointer-events-none select-none">
                              <rect
                                x={labelBox.x}
                                y={labelBox.y}
                                width={labelBox.width}
                                height={labelBox.height}
                                rx="0.5"
                                fill="#FFFFFF"
                                fillOpacity="0.96"
                                stroke={
                                  isStart
                                    ? "#1A1D14"
                                    : isDestination || isPathNode
                                    ? "#3C6849"
                                    : isInspected
                                    ? "#B77A26"
                                    : "#DFDFD4"
                                }
                                strokeWidth={isStart || isDestination || isInspected || isPathNode ? 0.35 : 0.25}
                              />
                              <text
                                x={labelBox.x + labelBox.width / 2}
                                y={labelBox.y + labelBox.height / 2 + 0.4}
                                textAnchor="middle"
                                fontSize="1.15"
                                fill={
                                  isStart
                                    ? "#1A1D14"
                                    : isDestination || isPathNode
                                    ? "#3C6849"
                                    : isInspected
                                    ? "#7A4F13"
                                    : "#46483E"
                                }
                                fontWeight={isStart || isDestination || isPathNode || isInspected ? "700" : "600"}
                                fontFamily="ui-monospace, monospace"
                              >
                                {compactLabel}
                              </text>
                            </g>
                          )}

                          {/* START Badge Pill */}
                          {isStart && badgeBox && (
                            <g className="pointer-events-none select-none">
                              <rect
                                x={badgeBox.x}
                                y={badgeBox.y}
                                width={badgeBox.width}
                                height={badgeBox.height}
                                rx="0.4"
                                fill="#1A1D14"
                                fillOpacity="0.98"
                                stroke="#1A1D14"
                                strokeWidth="0.3"
                              />
                              <text
                                x={badgeBox.x + badgeBox.width / 2}
                                y={badgeBox.y + badgeBox.height / 2 + 0.35}
                                textAnchor="middle"
                                fontSize="0.95"
                                fill="#FFFFFF"
                                fontWeight="bold"
                                fontFamily="ui-monospace, monospace"
                              >
                                START
                              </text>
                            </g>
                          )}

                          {/* DEST Badge Pill */}
                          {isDestination && strategy !== "evacuation" && badgeBox && (
                            <g className="pointer-events-none select-none">
                              <rect
                                x={badgeBox.x}
                                y={badgeBox.y}
                                width={badgeBox.width}
                                height={badgeBox.height}
                                rx="0.4"
                                fill="#3C6849"
                                fillOpacity="0.98"
                                stroke="#3C6849"
                                strokeWidth="0.3"
                              />
                              <text
                                x={badgeBox.x + badgeBox.width / 2}
                                y={badgeBox.y + badgeBox.height / 2 + 0.35}
                                textAnchor="middle"
                                fontSize="0.95"
                                fill="#FFFFFF"
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

              {/* MAP LEGEND */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#DFDFD4] bg-[#FAF9F5] p-3 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-[#3C6849] border border-white shadow-xs" />
                    <span className="text-[#686B60]">Emergency Exit Door</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-[#57603A] border border-white shadow-xs" />
                    <span className="text-[#686B60]">Building Entrance</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-[#B77A26] border border-white shadow-xs" />
                    <span className="text-[#686B60]">Assembly Grounds</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-[#686B60] border border-white shadow-xs" />
                    <span className="text-[#686B60]">Staircase / Corridor</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-[#46483E] border border-white shadow-xs" />
                    <span className="text-[#686B60]">Room</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1 w-4 rounded-full bg-[#3C6849]" />
                    <span className="text-[#686B60]">Active Route Path</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 border-b border-dashed border-[#57603A]" />
                    <span className="text-[#686B60]">Directed Arc</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* INSPECTION DRAWER / DETAILS CARD */}
          {(inspectedNode || inspectedEdge) && (
            <Card className="border border-[#DFDFD4] bg-[#FFFFFF] shadow-xs">
              <CardContent className="p-4">
                {inspectedNode && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs border-[#DFDFD4] bg-[#EEEDE5] text-[#46483E]">
                          {inspectedNode.node_type.toUpperCase()}
                        </Badge>
                        <h4 className="font-semibold text-[#1A1D14]">{inspectedNode.name}</h4>
                        <span className="text-xs text-[#686B60] font-mono">({inspectedNode.code})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-[#DFDFD4] bg-[#FFFFFF] hover:bg-[#EEEDE5] text-[#1A1D14]"
                          onClick={() => handleSetStart(inspectedNode.id)}
                        >
                          Set as Start
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-[#3C6849]/30 bg-[#E6EFE8] hover:bg-[#d9e6dc] text-[#244f32]"
                          onClick={() => handleSetDestination(inspectedNode.id)}
                        >
                          Set as Destination
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                      <div>
                        <span className="text-[#686B60]">Building:</span>
                        <p className="font-medium text-[#1A1D14]">{inspectedNode.building_name}</p>
                      </div>
                      <div>
                        <span className="text-[#686B60]">Floor:</span>
                        <p className="font-medium text-[#1A1D14]">{inspectedNode.floor_name}</p>
                      </div>
                      <div>
                        <span className="text-[#686B60]">Local Coordinates:</span>
                        <p className="font-mono text-[#1A1D14]">({inspectedNode.x}, {inspectedNode.y})</p>
                      </div>
                      <div>
                        <span className="text-[#686B60]">Capacity:</span>
                        <p className="font-medium text-[#1A1D14]">{inspectedNode.capacity} people</p>
                      </div>
                    </div>
                  </div>
                )}

                {inspectedEdge && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs border-[#DFDFD4] bg-[#EEEDE5] text-[#46483E]">
                          EDGE ({inspectedEdge.edge_type.toUpperCase()})
                        </Badge>
                        <span className="font-mono text-xs text-[#686B60]">{inspectedEdge.id}</span>
                      </div>
                      <Badge
                        variant="secondary"
                        className={inspectedEdge.bidirectional ? "bg-[#E6EFE8] text-[#244f32] border border-[#3C6849]/20" : "bg-[#EEEDE5] text-[#46483E]"}
                      >
                        {inspectedEdge.bidirectional ? "Bidirectional" : "One-Way Directed"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                      <div>
                        <span className="text-[#686B60]">From Node:</span>
                        <p className="font-medium text-[#1A1D14]">{getNodeById(inspectedEdge.from_node_id)?.name || "Unknown"}</p>
                      </div>
                      <div>
                        <span className="text-[#686B60]">To Node:</span>
                        <p className="font-medium text-[#1A1D14]">{getNodeById(inspectedEdge.to_node_id)?.name || "Unknown"}</p>
                      </div>
                      <div>
                        <span className="text-[#686B60]">Distance:</span>
                        <p className="font-mono font-medium text-[#1A1D14]">{inspectedEdge.distance} metres</p>
                      </div>
                      <div>
                        <span className="text-[#686B60]">Base Speed / Cap:</span>
                        <p className="font-mono text-[#1A1D14]">{inspectedEdge.base_speed} m/s · {inspectedEdge.base_capacity} ppl</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* CONTROLS & ROUTING SIDEBAR (4 cols) */}
        <div className="flex flex-col gap-6 lg:col-span-4">
          {/* Strategy & Route Configuration Card */}
          <Card className="border border-[#DFDFD4] bg-[#FFFFFF] shadow-xs">
            <CardHeader className="border-b border-[#DFDFD4] pb-3 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-[#1A1D14]">Route Controls & Strategy</CardTitle>
              <CardDescription className="text-xs text-[#686B60]">
                Select endpoints and pathfinding algorithm to calculate traversal corridors.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4 p-5">
              {/* Routing Strategy Selector */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1A1D14]">
                  Routing Strategy
                </label>
                <select
                  value={strategy}
                  onChange={(e) => {
                    const nextStrategy = e.target.value as RoutingStrategy;
                    setStrategy(nextStrategy);
                    handleClearRoute();
                  }}
                  className="w-full rounded-lg border border-[#DFDFD4] bg-[#FAF9F5] px-3 py-2 text-xs font-medium text-[#1A1D14] focus:border-[#57603A] focus:outline-none"
                >
                  <option value="shortest">Shortest Physical Distance (Dijkstra)</option>
                  <option value="astar">A* Search (Zero Heuristic)</option>
                  <option value="emergency">Emergency-Aware (Avoid Blockages)</option>
                  <option value="evacuation">Nearest Exit Evacuation (Exit Selection)</option>
                  <option value="congestion">Congestion Scenario Routing</option>
                  <option value="prediction">ML Route Travel-Time Prediction</option>
                </select>
              </div>

              {/* Start Node Selector */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1A1D14]">
                  Start Node
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
                  className="w-full rounded-lg border border-[#DFDFD4] bg-[#FAF9F5] px-3 py-2 text-xs font-medium text-[#1A1D14] focus:border-[#57603A] focus:outline-none"
                >
                  {DEMO_NODES.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.code} — {node.name} ({node.floor_name})
                    </option>
                  ))}
                </select>
              </div>

              {/* Destination Node Selector (Hidden if Evacuation strategy) */}
              {strategy !== "evacuation" ? (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#1A1D14]">
                    Destination Node
                  </label>
                  <select
                    value={destinationNodeId}
                    onChange={(e) => setDestinationNodeId(e.target.value)}
                    className="w-full rounded-lg border border-[#DFDFD4] bg-[#FAF9F5] px-3 py-2 text-xs font-medium text-[#1A1D14] focus:border-[#57603A] focus:outline-none"
                  >
                    {DEMO_NODES.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.code} — {node.name} ({node.floor_name})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="rounded-lg border border-[#3C6849]/25 bg-[#E6EFE8]/50 p-3 text-xs text-[#244f32]">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-[#3C6849]" />
                    <span>Automatic Exit Evaluation</span>
                  </div>
                  <p className="mt-1 text-[#46483E]">
                    Backend evaluates all 3 active campus exits and selects the nearest reachable exit by physical distance.
                  </p>
                </div>
              )}

              {/* Congestion & ML Parameters (When applicable) */}
              {(strategy === "congestion" || strategy === "prediction") && (
                <div className="flex flex-col gap-3 rounded-lg border border-[#DFDFD4] bg-[#FAF9F5] p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#1A1D14]">Scenario Parameters</span>
                    <Badge variant="outline" className="border-[#B77A26]/30 bg-[#FAF2E4] text-[10px] font-medium text-[#7A4F13]">
                      Scenario Only
                    </Badge>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-[#686B60]">
                      Base Walking Speed: <span className="font-mono font-semibold text-[#1A1D14]">{walkingSpeed} m/s</span>
                    </label>
                    <input
                      type="range"
                      min="0.6"
                      max="2.0"
                      step="0.1"
                      value={walkingSpeed}
                      onChange={(e) => setWalkingSpeed(parseFloat(e.target.value))}
                      className="w-full accent-[#57603A]"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-[#686B60]">
                      Crowd Scenario Preset
                    </label>
                    <select
                      value={scenarioPreset}
                      onChange={(e) => setScenarioPreset(e.target.value as "none" | "moderate" | "heavy")}
                      className="w-full rounded border border-[#DFDFD4] bg-[#FFFFFF] px-2 py-1.5 text-xs text-[#1A1D14]"
                    >
                      <option value="none">Baseline (No extra edge congestion)</option>
                      <option value="moderate">Moderate Corridor Crowding</option>
                      <option value="heavy">Heavy Emergency Exit Congestion</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Hazard Simulation (Demo Only) */}
              <div className="flex flex-col gap-2 rounded-lg border border-[#DFDFD4] bg-[#FAF9F5] p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#1A1D14]">Hazard Simulation (Demo Only)</span>
                  <Badge variant="outline" className="border-[#BA1A1A]/30 bg-[#FDF2F0] text-[10px] font-medium text-[#BA1A1A]">
                    Demo Only
                  </Badge>
                </div>
                <div>
                  <label htmlFor="hazard-scenario-select" className="mb-1 block text-xs text-[#686B60]">
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
                    className="w-full rounded border border-[#DFDFD4] bg-[#FFFFFF] px-2 py-1.5 text-xs text-[#1A1D14]"
                  >
                    <option value="none">Baseline — No simulated blockages</option>
                    <option value="fire_escape">1st Floor Fire Escape Blocked</option>
                    <option value="ground_exit">West Ground Emergency Exit Blocked</option>
                    <option value="all_admin_exits">All Administration Exits Blocked</option>
                  </select>
                </div>
                <p className="text-[10px] text-[#686B60] italic">
                  Injects test blockages into route calculation. Returning to Baseline clears all simulated hazards.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  onClick={() => handleCalculateRoute()}
                  disabled={routeLoading}
                  className="flex-1 gap-2 bg-[#57603A] hover:bg-[#626B45] font-semibold text-white text-xs shadow-xs"
                >
                  {routeLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Navigation className="h-4 w-4" />
                  )}
                  Calculate Route
                </Button>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCalculateRoute()}
                  disabled={routeLoading}
                  title="Recalculate route"
                  className="border-[#DFDFD4] bg-[#FFFFFF] hover:bg-[#EEEDE5] text-[#1A1D14]"
                >
                  <RefreshCw className={`h-4 w-4 text-[#686B60] ${routeLoading ? "animate-spin" : ""}`} />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearRoute}
                  title="Clear active route"
                  className="text-[#686B60] hover:text-[#1A1D14] hover:bg-[#EEEDE5]"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>

              {/* Error callout */}
              {routeError && (
                <div
                  className={`flex items-start gap-2.5 rounded-lg border p-3.5 text-xs transition-colors ${
                    routeError.kind === "unreachable"
                      ? "border-[#BA1A1A]/35 bg-[#FDF2F0]"
                      : routeError.kind === "network"
                      ? "border-[#8B5000]/30 bg-[#FFF8F0]"
                      : routeError.kind === "invalid_request"
                      ? "border-[#686B60]/30 bg-[#F5F4EE]"
                      : "border-[#BA1A1A]/30 bg-[#F9E8E7]"
                  }`}
                  role="alert"
                >
                  <AlertTriangle
                    className={`h-4 w-4 shrink-0 mt-0.5 ${
                      routeError.kind === "network"
                        ? "text-[#8B5000]"
                        : routeError.kind === "invalid_request"
                        ? "text-[#686B60]"
                        : "text-[#BA1A1A]"
                    }`}
                  />
                  <div className="flex-1">
                    <p
                      className={`font-semibold tracking-tight ${
                        routeError.kind === "network"
                          ? "text-[#703C00]"
                          : routeError.kind === "invalid_request"
                          ? "text-[#1A1D14]"
                          : "text-[#BA1A1A]"
                      }`}
                    >
                      {routeError.title}
                    </p>
                    <p className="mt-1 leading-relaxed text-[#43483E]">{routeError.message}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ROUTE RESULTS & SUMMARY CARD */}
          {(
            (strategy === "evacuation" && evacuationResult !== null) ||
            (strategy === "emergency" && emergencyResult !== null) ||
            (strategy === "congestion" && congestionResult !== null) ||
            (strategy === "prediction" && predictionResult !== null) ||
            ((strategy === "shortest" || strategy === "astar") && shortestResult !== null)
          ) && (
            <Card className="border border-[#DFDFD4] bg-[#FFFFFF] shadow-xs">
              <CardHeader className="border-b border-[#DFDFD4] pb-3 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-[#1A1D14]">Route Telemetry</CardTitle>
                  {strategy === "evacuation" ? (
                    evacuationResult?.status === "no_route" ? (
                      <span className="inline-flex items-center rounded-full border border-[#BA1A1A]/30 bg-[#FDF2F0] px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-[#BA1A1A]">
                        No Exit Reachable
                      </span>
                    ) : evacuationResult?.blocked_edge_count && evacuationResult.blocked_edge_count > 0 ? (
                      <span className="inline-flex items-center rounded-full border border-[#B77A26]/30 bg-[#FAF2E4] px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-[#7A4F13]">
                        Alternate Route Selected
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-[#3C6849]/25 bg-[#E6EFE8] px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-[#244f32]">
                        Active Path
                      </span>
                    )
                  ) : strategy === "emergency" && emergencyResult?.blocked_edge_count && emergencyResult.blocked_edge_count > 0 ? (
                    <span className="inline-flex items-center rounded-full border border-[#B77A26]/30 bg-[#FAF2E4] px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-[#7A4F13]">
                      Alternate Route Selected
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-[#3C6849]/25 bg-[#E6EFE8] px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-[#244f32]">
                      Active Path
                    </span>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex flex-col gap-4 p-5 text-xs">
                {/* Distance & Travel Time Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-[#DFDFD4] bg-[#FAF9F5] p-3.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#686B60]">
                      Physical Distance
                    </span>
                    <p className="mt-1 text-2xl font-bold font-mono tracking-tight text-[#1A1D14]">
                      {strategy === "evacuation" ? (
                        evacuationResult?.status === "route_found" &&
                        evacuationResult.total_distance_m !== null &&
                        evacuationResult.total_distance_m !== undefined ? (
                          <>
                            {evacuationResult.total_distance_m.toFixed(1)}
                            <span className="text-xs font-normal text-[#686B60] ml-1.5">m</span>
                          </>
                        ) : (
                          "—"
                        )
                      ) : strategy === "emergency" ? (
                        emergencyResult?.total_distance_m !== null && emergencyResult?.total_distance_m !== undefined ? (
                          <>
                            {emergencyResult.total_distance_m.toFixed(1)}
                            <span className="text-xs font-normal text-[#686B60] ml-1.5">m</span>
                          </>
                        ) : (
                          "—"
                        )
                      ) : strategy === "congestion" ? (
                        congestionResult?.total_distance_m !== null && congestionResult?.total_distance_m !== undefined ? (
                          <>
                            {congestionResult.total_distance_m.toFixed(1)}
                            <span className="text-xs font-normal text-[#686B60] ml-1.5">m</span>
                          </>
                        ) : (
                          "—"
                        )
                      ) : strategy === "prediction" ? (
                        predictionResult?.route_distance_m !== null && predictionResult?.route_distance_m !== undefined ? (
                          <>
                            {predictionResult.route_distance_m.toFixed(1)}
                            <span className="text-xs font-normal text-[#686B60] ml-1.5">m</span>
                          </>
                        ) : (
                          "—"
                        )
                      ) : shortestResult?.total_distance_m !== null && shortestResult?.total_distance_m !== undefined ? (
                        <>
                          {shortestResult.total_distance_m.toFixed(1)}
                          <span className="text-xs font-normal text-[#686B60] ml-1.5">m</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>

                  <div className="rounded-lg border border-[#DFDFD4] bg-[#FAF9F5] p-3.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#686B60]">
                      Estimated Duration
                    </span>
                    {congestionResult ? (
                      <p className="mt-1 text-2xl font-bold font-mono tracking-tight text-[#3C6849]">
                        {congestionResult.estimated_travel_time_s.toFixed(1)}s
                      </p>
                    ) : predictionResult ? (
                      <p className="mt-1 text-2xl font-bold font-mono tracking-tight text-[#3C6849]">
                        {predictionResult.predicted_travel_time_s.toFixed(1)}s
                      </p>
                    ) : (
                      <p className="mt-2 text-xs font-medium text-[#686B60] italic">
                        Distance-only mode
                      </p>
                    )}
                  </div>
                </div>

                {/* Strategy-Specific Notices */}
                {strategy === "emergency" && emergencyResult && (
                  <div className="rounded-lg border border-[#B77A26]/30 bg-[#FAF2E4]/60 p-3 text-[#1A1D14]">
                    <div className="font-semibold text-[#7A4F13]">Emergency Avoidance Active</div>
                    <p className="mt-1 text-[#46483E]">
                      Active Emergencies: {emergencyResult.active_emergency_ids.length} · Blocked Nodes:{" "}
                      {emergencyResult.blocked_node_count} · Blocked Edges: {emergencyResult.blocked_edge_count}
                    </p>
                    <p className="mt-1 text-[11px] text-[#686B60]">
                      Risk weighting applied: {String(emergencyResult.risk_weighting_applied)} ({emergencyResult.risk_weighting_status})
                    </p>
                  </div>
                )}

                {strategy === "evacuation" && evacuationResult && (
                  <div
                    className={`rounded-lg border p-3.5 text-[#1A1D14] ${
                      evacuationResult.status === "no_route"
                        ? "border-[#BA1A1A]/30 bg-[#FDF2F0]"
                        : evacuationResult.blocked_edge_count && evacuationResult.blocked_edge_count > 0
                        ? "border-[#B77A26]/30 bg-[#FAF2E4]/60"
                        : "border-[#3C6849]/25 bg-[#E6EFE8]/40"
                    }`}
                  >
                    <div
                      className={`font-semibold ${
                        evacuationResult.status === "no_route"
                          ? "text-[#BA1A1A]"
                          : evacuationResult.blocked_edge_count && evacuationResult.blocked_edge_count > 0
                          ? "text-[#7A4F13]"
                          : "text-[#244f32]"
                      }`}
                    >
                      {evacuationResult.status === "no_route"
                        ? "No Reachable Exit Available"
                        : evacuationResult.blocked_edge_count && evacuationResult.blocked_edge_count > 0
                        ? `Alternate Route Selected: ${evacuationResult.selected_exit_name || "None"}`
                        : `Selected Exit: ${evacuationResult.selected_exit_name || "None"}`}
                    </div>
                    <p className="mt-1 text-[#46483E]">
                      {evacuationResult.status === "no_route"
                        ? "All candidate exits are currently unreachable or blocked under active hazard conditions. No valid path exists."
                        : evacuationResult.blocked_edge_count && evacuationResult.blocked_edge_count > 0
                        ? `Hazard avoidance active: ${evacuationResult.blocked_edge_count} blocked edge(s) avoided. Route recalculated to nearest reachable exit.`
                        : `Objective: ${evacuationResult.selection_objective}`}
                    </p>
                    <div className="mt-2.5 flex flex-col gap-1.5 border-t border-[#DFDFD4] pt-2.5">
                      <span className="font-semibold text-[#1A1D14]">Candidate Exit Evaluation:</span>
                      {evacuationResult.evaluated_exits.map((ex) => (
                        <div key={ex.exit_id} className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-[#1A1D14]">{ex.name}</span>
                          <span
                            className={
                              ex.reachable
                                ? "font-mono font-semibold text-[#3C6849]"
                                : "font-mono text-[#BA1A1A]"
                            }
                          >
                            {ex.reachable
                              ? `${ex.distance_m?.toFixed(1)}m`
                              : `Excluded (${ex.exclusion_reason || "unreachable"})`}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2.5 text-[10px] text-[#686B60] italic">
                      {evacuationResult.safety_notice}
                    </p>
                  </div>
                )}

                {strategy === "congestion" && congestionResult && (
                  <div className="rounded-lg border border-[#DFDFD4] bg-[#FAF9F5] p-3 text-[#1A1D14]">
                    <div className="font-semibold text-[#1A1D14]">Congestion Scenario Analysis</div>
                    <p className="mt-1 text-[#686B60]">
                      Mode: {congestionResult.data_mode} · Live sensors:{" "}
                      {String(congestionResult.live_crowd_measurements_used)}
                    </p>
                  </div>
                )}

                {strategy === "prediction" && predictionResult && (
                  <div className="rounded-lg border border-[#DFDFD4] bg-[#FAF9F5] p-3 text-[#1A1D14]">
                    <div className="font-semibold text-[#57603A]">
                      ML Travel-Time Model ({predictionResult.model_version})
                    </div>
                    <p className="mt-1 text-[#686B60]">
                      Training Data: {predictionResult.training_data_type} · Features Evaluated:{" "}
                      {Object.keys(predictionResult.features).length}
                    </p>
                    <div className="mt-2.5 rounded border border-[#B77A26]/30 bg-[#FAF2E4] p-2 text-[11px] text-[#7A4F13]">
                      <span className="font-semibold">Model Governance Notice: </span>
                      {predictionResult.validation_limitation}
                    </div>
                  </div>
                )}

                {/* Ordered Path Steps */}
                {activePathNodeIds.length > 0 && (
                  <div>
                    <span className="font-semibold text-[#1A1D14]">Waypoint Path Sequence ({activePathNodeIds.length} Nodes)</span>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                      {activePathNodeIds.map((id, index) => {
                        const node = getNodeById(id);
                        return (
                          <React.Fragment key={id}>
                            <span
                              onClick={() => handleNodeClick(node!)}
                              className="cursor-pointer rounded border border-[#DFDFD4] bg-[#EEEDE5] px-2 py-0.5 text-[#1A1D14] hover:bg-[#57603A] hover:text-white transition-colors"
                            >
                              {node?.code || id.slice(0, 8)}
                            </span>
                            {index < activePathNodeIds.length - 1 && (
                              <ArrowRight className="h-3 w-3 text-[#C7C7BA]" />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Step Breakdown Table */}
                {activePathNodeIds.length > 1 && (
                  <div>
                    <span className="font-semibold text-[#1A1D14]">Segment Breakdown</span>
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[#DFDFD4]">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-[#FAF9F5] font-semibold text-[#686B60] sticky top-0 border-b border-[#DFDFD4]">
                          <tr>
                            <th className="p-2">#</th>
                            <th className="p-2">Traversed Arc</th>
                            <th className="p-2 text-right">Distance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#DFDFD4]">
                          {(shortestResult?.steps ||
                            emergencyResult?.steps ||
                            evacuationResult?.steps ||
                            congestionResult?.steps ||
                            []).map((step, idx) => {
                            const fromN = getNodeById(step.from_node_id);
                            const toN = getNodeById(step.to_node_id);
                            return (
                              <tr key={`${step.edge_id}-${idx}`} className="hover:bg-[#FAF9F5] transition-colors">
                                <td className="p-2 font-mono text-[#686B60]">{idx + 1}</td>
                                <td className="p-2 font-mono text-[#1A1D14]">
                                  {fromN?.code} → {toN?.code}
                                </td>
                                <td className="p-2 text-right font-mono font-semibold text-[#3C6849]">
                                  {step.distance_m}m
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Authoritative Campus Graph Diagnostics */}
          <Card className="border border-[#DFDFD4] bg-[#FFFFFF] shadow-xs">
            <CardHeader className="border-b border-[#DFDFD4] pb-2.5 pt-3 px-5">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#686B60]">
                Authoritative Graph Telemetry
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 text-xs">
              <div className="grid grid-cols-2 gap-3 font-mono">
                <div className="rounded border border-[#DFDFD4] bg-[#FAF9F5] p-2.5">
                  <span className="text-[10px] text-[#686B60] uppercase block">Graph Nodes</span>
                  <span className="text-base font-bold text-[#1A1D14]">
                    {graphSummary?.node_count || DEMO_NODES.length}
                  </span>
                </div>
                <div className="rounded border border-[#DFDFD4] bg-[#FAF9F5] p-2.5">
                  <span className="text-[10px] text-[#686B60] uppercase block">Stored Edges</span>
                  <span className="text-base font-bold text-[#1A1D14]">
                    {graphSummary?.edge_count || DEMO_EDGES.length}
                  </span>
                </div>
                <div className="rounded border border-[#DFDFD4] bg-[#FAF9F5] p-2.5">
                  <span className="text-[10px] text-[#686B60] uppercase block">Traversal Arcs</span>
                  <span className="text-base font-bold text-[#1A1D14]">
                    {graphSummary?.arc_count || 39}
                  </span>
                </div>
                <div className="rounded border border-[#DFDFD4] bg-[#FAF9F5] p-2.5">
                  <span className="text-[10px] text-[#686B60] uppercase block">Emergency Exits</span>
                  <span className="text-xs font-bold text-[#3C6849]">
                    {graphSummary?.exit_count || 3} Active Exits
                  </span>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-[#686B60]">
                Demo Campus · Edge 21 Active Walkway · {graphSummary?.bidirectional_edge_count || 18} Bidirectional · {graphSummary?.directed_edge_count || 3} Directed Arcs
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
