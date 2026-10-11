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
  const [routeError, setRouteError] = useState<string | null>(null);

  // Results
  const [shortestResult, setShortestResult] = useState<ShortestRouteResponse | null>(null);
  const [emergencyResult, setEmergencyResult] = useState<EmergencyAwareRouteResponse | null>(null);
  const [evacuationResult, setEvacuationResult] = useState<ExitSelectionResponse | null>(null);
  const [congestionResult, setCongestionResult] = useState<CongestionRouteResponse | null>(null);
  const [predictionResult, setPredictionResult] = useState<RouteTimePredictionResponse | null>(null);

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
    if (strategy === "evacuation" && evacuationResult) {
      return evacuationResult.path_node_ids || [];
    }
    if (strategy === "emergency" && emergencyResult) {
      return emergencyResult.path_node_ids || [];
    }
    if (strategy === "congestion" && congestionResult) {
      return congestionResult.path_node_ids || [];
    }
    if (strategy === "prediction" && predictionResult) {
      return predictionResult.path_node_ids || [];
    }
    if (shortestResult) {
      return shortestResult.path_node_ids || [];
    }
    return [];
  }, [strategy, shortestResult, emergencyResult, evacuationResult, congestionResult, predictionResult]);

  // Active path edge IDs
  const activePathEdgeIds = useMemo<string[]>(() => {
    if (strategy === "evacuation" && evacuationResult) {
      return evacuationResult.steps.map((s) => s.edge_id);
    }
    if (strategy === "emergency" && emergencyResult) {
      return emergencyResult.steps.map((s) => s.edge_id);
    }
    if (strategy === "congestion" && congestionResult) {
      return congestionResult.steps.map((s) => s.edge_id);
    }
    if (strategy === "prediction" && predictionResult) {
      return predictionResult.edge_ids || [];
    }
    if (shortestResult) {
      return shortestResult.steps.map((s) => s.edge_id);
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

  // Execute Route Request
  const handleCalculateRoute = async () => {
    setRouteLoading(true);
    setRouteError(null);
    setShortestResult(null);
    setEmergencyResult(null);
    setEvacuationResult(null);
    setCongestionResult(null);
    setPredictionResult(null);

    try {
      if (strategy === "shortest") {
        const res = await getShortestRoute(campusId, {
          start_node_id: startNodeId,
          destination_node_id: destinationNodeId,
        });
        setShortestResult(res);
      } else if (strategy === "astar") {
        const res = await getAstarRoute(campusId, {
          start_node_id: startNodeId,
          destination_node_id: destinationNodeId,
        });
        setShortestResult(res);
      } else if (strategy === "emergency") {
        const res = await getEmergencyAwareRoute(campusId, {
          start_node_id: startNodeId,
          destination_node_id: destinationNodeId,
        });
        setEmergencyResult(res);
      } else if (strategy === "evacuation") {
        const res = await getEvacuationRoute(campusId, {
          start_node_id: startNodeId,
        });
        setEvacuationResult(res);
      } else if (strategy === "congestion") {
        const res = await getCongestionRoute(campusId, {
          start_node_id: startNodeId,
          destination_node_id: destinationNodeId,
          base_walking_speed_mps: walkingSpeed,
          edge_scenarios: edgeScenarios,
        });
        setCongestionResult(res);
      } else if (strategy === "prediction") {
        // Step 1: obtain traversable path via baseline shortest route first
        const baseRoute = await getShortestRoute(campusId, {
          start_node_id: startNodeId,
          destination_node_id: destinationNodeId,
        });
        setShortestResult(baseRoute);

        // Step 2: predict travel time along this route
        const edgeIds = baseRoute.steps.map((s) => s.edge_id);
        const predRes = await predictRouteTime(campusId, {
          path_node_ids: baseRoute.path_node_ids,
          edge_ids: edgeIds,
          base_walking_speed_mps: walkingSpeed,
          edge_scenarios: edgeScenarios,
        });
        setPredictionResult(predRes);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Routing request failed";
      setRouteError(msg);
    } finally {
      setRouteLoading(false);
    }
  };

  // Node selection handler for interactive SVG clicks
  const handleNodeClick = (node: GraphNodeDefinition) => {
    setInspectedNodeId(node.id);
    setInspectedEdgeId(null);
  };

  const handleSetStart = (id: string) => {
    setStartNodeId(id);
  };

  const handleSetDestination = (id: string) => {
    setDestinationNodeId(id);
  };

  const handleClearRoute = () => {
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
      <div className="flex flex-col gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-300">
        <div className="flex items-center gap-2 font-medium text-amber-200">
          <Info className="h-4 w-4 shrink-0 text-amber-400" />
          <span>Schematic Demo Campus Map</span>
        </div>
        <p className="text-muted-foreground">
          Coordinates are local illustrative values from repository seed data, not geodetically calibrated
          measurements. Minimum-distance and estimated travel-time routes do not represent validated real-world
          safety guarantees.
        </p>
      </div>

      {/* Main Grid: Map Visualizer on Left/Top, Route Controls on Right/Bottom */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* MAP VISUALIZATION CANVAS (8 cols) */}
        <div className="flex flex-col gap-4 lg:col-span-8">
          <Card className="overflow-hidden border border-border/50 bg-card/40 backdrop-blur-md">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-3 pt-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Navigation className="h-4 w-4 text-emerald-400" />
                  Campus Topology Visualizer
                </CardTitle>
                <CardDescription className="text-xs">
                  {DEMO_CAMPUS_NAME} · {DEMO_NODES.length} Nodes · {DEMO_EDGES.length} Stored Edges · 3 Exits · 1 Assembly Point
                </CardDescription>
              </div>

              {/* Floor Filters */}
              <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-background/50 p-1">
                <button
                  type="button"
                  onClick={() => setFloorFilter("all")}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    floorFilter === "all"
                      ? "bg-emerald-500 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All Floors
                </button>
                <button
                  type="button"
                  onClick={() => setFloorFilter("ground")}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    floorFilter === "ground"
                      ? "bg-emerald-500 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Ground Floor
                </button>
                <button
                  type="button"
                  onClick={() => setFloorFilter("first")}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    floorFilter === "first"
                      ? "bg-emerald-500 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  First Floor
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-4">
              {/* SVG Canvas Area with Extended Viewing Space & Zoom/Pan */}
              <div className="relative h-[490px] sm:h-[550px] md:h-[610px] w-full overflow-hidden rounded-xl border border-border/30 bg-slate-950/80 shadow-inner select-none">
                {/* Floating Zoom & Pan Controls */}
                <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-border/50 bg-slate-900/85 p-1 backdrop-blur-md shadow-lg">
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    aria-label="Zoom in"
                    className="rounded p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                    title="Zoom In (+)"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <span className="px-1 text-[11px] font-mono text-slate-400 select-none min-w-[36px] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    aria-label="Zoom out"
                    className="rounded p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                    title="Zoom Out (-)"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <div className="h-4 w-[1px] bg-slate-700 mx-0.5" />
                  <button
                    type="button"
                    onClick={handleResetZoomPan}
                    aria-label="Reset view"
                    className="rounded p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                    title="Reset View"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>

                {/* Navigation Hint */}
                <div className="absolute bottom-2 left-3 pointer-events-none text-[10px] text-slate-500 font-mono z-10">
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
                      <path d="M 0 1 L 9 5 L 0 9 z" fill="#38bdf8" />
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
                      <path d="M 0 1 L 9 5 L 0 9 z" fill="#10b981" />
                    </marker>
                    {/* Glow filter for route line */}
                    <filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="0.8" result="blur" />
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
                    {/* Building Zone Background Boundaries (Schematic) */}
                    <g>
                      {/* Administration Building Zone Rect */}
                      <rect
                        x="4"
                        y="16.5"
                        width="34"
                        height="17"
                        rx="3"
                        fill="#0f172a"
                        fillOpacity="0.45"
                        stroke="#0ea5e9"
                        strokeOpacity="0.3"
                        strokeWidth="0.4"
                        strokeDasharray="2 1"
                      />

                      {/* Academic Building Zone Rect */}
                      <rect
                        x="54"
                        y="16.5"
                        width="35"
                        height="17"
                        rx="3"
                        fill="#0f172a"
                        fillOpacity="0.45"
                        stroke="#0ea5e9"
                        strokeOpacity="0.3"
                        strokeWidth="0.4"
                        strokeDasharray="2 1"
                      />

                      {/* Central Courtyard / Walkway Zone Rect */}
                      <rect
                        x="39"
                        y="0.5"
                        width="20"
                        height="14"
                        rx="3"
                        fill="#0f172a"
                        fillOpacity="0.45"
                        stroke="#d97706"
                        strokeOpacity="0.3"
                        strokeWidth="0.4"
                        strokeDasharray="2 1"
                      />

                      {/* High-Contrast Building Header Badges */}
                      {/* Administration Building Header */}
                      <g className="pointer-events-none select-none">
                        <rect
                          x="5"
                          y="14.2"
                          width="23"
                          height="3.2"
                          rx="0.8"
                          fill="#090d16"
                          stroke="#38bdf8"
                          strokeWidth="0.35"
                        />
                        <text
                          x="16.5"
                          y="16.35"
                          textAnchor="middle"
                          fill="#38bdf8"
                          fontSize="1.35"
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
                          fill="#090d16"
                          stroke="#38bdf8"
                          strokeWidth="0.35"
                        />
                        <text
                          x="65.5"
                          y="16.35"
                          textAnchor="middle"
                          fill="#38bdf8"
                          fontSize="1.35"
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
                          fill="#1c1917"
                          stroke="#fbbf24"
                          strokeWidth="0.35"
                        />
                        <text
                          x="49"
                          y="0.8"
                          textAnchor="middle"
                          fill="#fbbf24"
                          fontSize="1.25"
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
                      const isInspected = inspectedEdgeId === edge.id;
                      const isOneWay = !edge.bidirectional;

                      return (
                        <g key={edge.id}>
                          {/* Base line */}
                          <line
                            x1={p1.svgX}
                            y1={p1.svgY}
                            x2={p2.svgX}
                            y2={p2.svgY}
                            stroke={
                              isPathEdge
                                ? "#10b981"
                                : isInspected
                                ? "#f59e0b"
                                : isOneWay
                                ? "#38bdf8"
                                : "#334155"
                            }
                            strokeWidth={isPathEdge ? 1.4 : isInspected ? 1.0 : 0.6}
                            strokeDasharray={
                              edge.edge_type === "staircase"
                                ? "1.2 0.8"
                                : isOneWay && !isPathEdge
                                ? "2 1"
                                : undefined
                            }
                            markerEnd={
                              isPathEdge
                                ? "url(#route-arrow)"
                                : isOneWay
                                ? "url(#directed-arrow)"
                                : undefined
                            }
                            filter={isPathEdge ? "url(#route-glow)" : undefined}
                            className="cursor-pointer transition-all hover:stroke-cyan-400"
                            onClick={() => {
                              setInspectedEdgeId(edge.id);
                              setInspectedNodeId(null);
                            }}
                          />
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

                      // Color scheme by type
                      let nodeFill = "#64748b"; // default slate
                      let nodeStroke = "#94a3b8";
                      let radius = 1.6;

                      if (node.is_assembly_point) {
                        nodeFill = "#f59e0b"; // amber
                        nodeStroke = "#fbbf24";
                        radius = 2.4;
                      } else if (node.is_exit) {
                        nodeFill = "#22c55e"; // bright green
                        nodeStroke = "#4ade80";
                        radius = 2.2;
                      } else if (node.node_type === "entrance") {
                        nodeFill = "#059669"; // emerald
                        nodeStroke = "#34d399";
                        radius = 2.0;
                      } else if (node.node_type === "staircase") {
                        nodeFill = "#8b5cf6"; // purple
                        nodeStroke = "#a78bfa";
                        radius = 1.8;
                      } else if (node.node_type === "room") {
                        nodeFill = "#06b6d4"; // cyan
                        nodeStroke = "#67e8f9";
                        radius = 1.7;
                      } else if (node.node_type === "junction") {
                        nodeFill = "#3b82f6"; // blue
                        nodeStroke = "#60a5fa";
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
                                  ? "#10b981"
                                  : isDestination
                                  ? "#38bdf8"
                                  : isInspected
                                  ? "#f59e0b"
                                  : "#34d399"
                              }
                              strokeWidth={0.6}
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
                            stroke={
                              isStart
                                ? "#ffffff"
                                : isDestination
                                ? "#ffffff"
                                : nodeStroke
                            }
                            strokeWidth={isStart || isDestination ? 0.8 : 0.4}
                            className="transition-colors duration-150 group-hover:stroke-white"
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
                                fill="#020617"
                                fillOpacity="0.92"
                                stroke={
                                  isStart
                                    ? "#10b981"
                                    : isDestination
                                    ? "#38bdf8"
                                    : isPathNode
                                    ? "#34d399"
                                    : isInspected
                                    ? "#f59e0b"
                                    : "#334155"
                                }
                                strokeWidth={isStart || isDestination || isInspected ? 0.4 : 0.25}
                              />
                              <text
                                x={labelBox.x + labelBox.width / 2}
                                y={labelBox.y + labelBox.height / 2 + 0.4}
                                textAnchor="middle"
                                fontSize="1.15"
                                fill={
                                  isStart || isDestination
                                    ? "#ffffff"
                                    : isPathNode
                                    ? "#34d399"
                                    : isInspected
                                    ? "#fef08a"
                                    : "#e2e8f0"
                                }
                                fontWeight={isStart || isDestination || isPathNode || isInspected ? "bold" : "600"}
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
                                fill="#064e3b"
                                fillOpacity="0.95"
                                stroke="#10b981"
                                strokeWidth="0.3"
                              />
                              <text
                                x={badgeBox.x + badgeBox.width / 2}
                                y={badgeBox.y + badgeBox.height / 2 + 0.35}
                                textAnchor="middle"
                                fontSize="0.95"
                                fill="#a7f3d0"
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
                                fill="#0c4a6e"
                                fillOpacity="0.95"
                                stroke="#38bdf8"
                                strokeWidth="0.3"
                              />
                              <text
                                x={badgeBox.x + badgeBox.width / 2}
                                y={badgeBox.y + badgeBox.height / 2 + 0.35}
                                textAnchor="middle"
                                fontSize="0.95"
                                fill="#bae6fd"
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
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/30 bg-background/40 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-sm" />
                    <span className="text-muted-foreground">Exit / Entrance</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-amber-500 shadow-sm" />
                    <span className="text-muted-foreground">Assembly Point</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-purple-500 shadow-sm" />
                    <span className="text-muted-foreground">Staircase</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-cyan-500 shadow-sm" />
                    <span className="text-muted-foreground">Room</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-blue-500 shadow-sm" />
                    <span className="text-muted-foreground">Corridor / Junction</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 bg-emerald-400" />
                    <span className="text-muted-foreground">Calculated Route</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 border-b border-dashed border-sky-400" />
                    <span className="text-muted-foreground">Directed Arc</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* INSPECTION DRAWER / DETAILS CARD */}
          {(inspectedNode || inspectedEdge) && (
            <Card className="border border-border/40 bg-card/30 backdrop-blur-sm">
              <CardContent className="p-4">
                {inspectedNode && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {inspectedNode.node_type.toUpperCase()}
                        </Badge>
                        <h4 className="font-semibold">{inspectedNode.name}</h4>
                        <span className="text-xs text-muted-foreground font-mono">({inspectedNode.code})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-emerald-400 hover:text-emerald-300"
                          onClick={() => handleSetStart(inspectedNode.id)}
                        >
                          Set as Start
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-sky-400 hover:text-sky-300"
                          onClick={() => handleSetDestination(inspectedNode.id)}
                        >
                          Set as Destination
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                      <div>
                        <span className="text-muted-foreground">Building:</span>
                        <p className="font-medium">{inspectedNode.building_name}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Floor:</span>
                        <p className="font-medium">{inspectedNode.floor_name}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Local Coordinates:</span>
                        <p className="font-mono">({inspectedNode.x}, {inspectedNode.y})</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Capacity:</span>
                        <p className="font-medium">{inspectedNode.capacity} people</p>
                      </div>
                    </div>
                  </div>
                )}

                {inspectedEdge && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          EDGE ({inspectedEdge.edge_type.toUpperCase()})
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">{inspectedEdge.id}</span>
                      </div>
                      <Badge
                        variant="secondary"
                        className={inspectedEdge.bidirectional ? "text-emerald-400" : "text-sky-400"}
                      >
                        {inspectedEdge.bidirectional ? "Bidirectional" : "One-Way Directed"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                      <div>
                        <span className="text-muted-foreground">From Node:</span>
                        <p className="font-medium">{getNodeById(inspectedEdge.from_node_id)?.name || "Unknown"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">To Node:</span>
                        <p className="font-medium">{getNodeById(inspectedEdge.to_node_id)?.name || "Unknown"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Distance:</span>
                        <p className="font-mono font-medium">{inspectedEdge.distance} metres</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Base Speed / Cap:</span>
                        <p className="font-mono">{inspectedEdge.base_speed} m/s · {inspectedEdge.base_capacity} ppl</p>
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
          <Card className="border border-border/50 bg-card/40 backdrop-blur-md">
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="text-base font-semibold">Route Controls</CardTitle>
              <CardDescription className="text-xs">
                Select endpoints and routing strategy to calculate pathways.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              {/* Routing Strategy Selector */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Routing Strategy
                </label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as RoutingStrategy)}
                  className="w-full rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-xs text-foreground focus:border-emerald-500 focus:outline-none"
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
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Start Node
                </label>
                <select
                  value={startNodeId}
                  onChange={(e) => setStartNodeId(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-xs text-foreground focus:border-emerald-500 focus:outline-none"
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
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Destination Node
                  </label>
                  <select
                    value={destinationNodeId}
                    onChange={(e) => setDestinationNodeId(e.target.value)}
                    className="w-full rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-xs text-foreground focus:border-emerald-500 focus:outline-none"
                  >
                    {DEMO_NODES.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.code} — {node.name} ({node.floor_name})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300">
                  <div className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Automatic Exit Evaluation</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Backend evaluates all 3 active campus exits and selects the nearest reachable exit by physical distance.
                  </p>
                </div>
              )}

              {/* Congestion & ML Parameters (When applicable) */}
              {(strategy === "congestion" || strategy === "prediction") && (
                <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-background/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Scenario Parameters</span>
                    <Badge variant="outline" className="text-[10px] text-amber-400">
                      Scenario Only
                    </Badge>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Base Walking Speed: <span className="font-mono text-foreground">{walkingSpeed} m/s</span>
                    </label>
                    <input
                      type="range"
                      min="0.6"
                      max="2.0"
                      step="0.1"
                      value={walkingSpeed}
                      onChange={(e) => setWalkingSpeed(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Crowd Scenario Preset
                    </label>
                    <select
                      value={scenarioPreset}
                      onChange={(e) => setScenarioPreset(e.target.value as "none" | "moderate" | "heavy")}
                      className="w-full rounded border border-border/50 bg-background px-2 py-1.5 text-xs text-foreground"
                    >
                      <option value="none">Baseline (No extra edge congestion)</option>
                      <option value="moderate">Moderate Corridor Crowding</option>
                      <option value="heavy">Heavy Emergency Exit Congestion</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  onClick={handleCalculateRoute}
                  disabled={routeLoading}
                  className="flex-1 gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 font-medium text-white shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-teal-700"
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
                  onClick={handleCalculateRoute}
                  disabled={routeLoading}
                  title="Recalculate with fresh conditions"
                >
                  <RefreshCw className={`h-4 w-4 ${routeLoading ? "animate-spin" : ""}`} />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearRoute}
                  title="Clear active route"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>

              {/* Error callout */}
              {routeError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                  <div>
                    <p className="font-semibold text-red-200">Routing Request Failed</p>
                    <p className="mt-0.5">{routeError}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ROUTE RESULTS & SUMMARY CARD */}
          {(shortestResult || emergencyResult || evacuationResult || congestionResult || predictionResult) && (
            <Card className="border border-border/50 bg-card/40 backdrop-blur-md">
              <CardHeader className="pb-3 pt-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Route Summary</CardTitle>
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                    Route Found
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="flex flex-col gap-4 text-xs">
                {/* Distance & Travel Time Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/30 bg-background/50 p-3">
                    <span className="text-muted-foreground">Total Physical Distance</span>
                    <p className="mt-1 text-lg font-bold text-foreground font-mono">
                      {evacuationResult
                        ? evacuationResult.total_distance_m?.toFixed(1)
                        : (shortestResult || emergencyResult || congestionResult)?.total_distance_m.toFixed(1) ||
                          predictionResult?.route_distance_m.toFixed(1)}
                      <span className="text-xs font-normal text-muted-foreground ml-1">metres</span>
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/30 bg-background/50 p-3">
                    <span className="text-muted-foreground">Estimated Time</span>
                    {congestionResult ? (
                      <p className="mt-1 text-lg font-bold font-mono text-emerald-400">
                        {congestionResult.estimated_travel_time_s.toFixed(1)}s
                      </p>
                    ) : predictionResult ? (
                      <p className="mt-1 text-lg font-bold font-mono text-teal-400">
                        {predictionResult.predicted_travel_time_s.toFixed(1)}s
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs font-medium text-muted-foreground italic">
                        Not estimated for this strategy
                      </p>
                    )}
                  </div>
                </div>

                {/* Strategy-Specific Notices */}
                {strategy === "emergency" && emergencyResult && (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-muted-foreground">
                    <div className="font-medium text-blue-300">Emergency-Aware Status</div>
                    <p className="mt-1">
                      Active Emergencies: {emergencyResult.active_emergency_ids.length} · Blocked Nodes:{" "}
                      {emergencyResult.blocked_node_count} · Blocked Edges: {emergencyResult.blocked_edge_count}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/80">
                      Risk weighting applied: {String(emergencyResult.risk_weighting_applied)} ({emergencyResult.risk_weighting_status})
                    </p>
                  </div>
                )}

                {strategy === "evacuation" && evacuationResult && (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="font-semibold text-emerald-300">
                      Selected Exit: {evacuationResult.selected_exit_name || "None"}
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      Objective: {evacuationResult.selection_objective}
                    </p>
                    <div className="mt-2 flex flex-col gap-1 border-t border-border/30 pt-2">
                      <span className="font-medium text-foreground">Evaluated Exits:</span>
                      {evacuationResult.evaluated_exits.map((ex) => (
                        <div key={ex.exit_id} className="flex items-center justify-between text-[11px]">
                          <span>{ex.name}</span>
                          <span className={ex.reachable ? "text-emerald-400 font-mono" : "text-red-400"}>
                            {ex.reachable ? `${ex.distance_m?.toFixed(1)}m` : `Excluded (${ex.exclusion_reason})`}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground/70 italic">
                      {evacuationResult.safety_notice}
                    </p>
                  </div>
                )}

                {strategy === "congestion" && congestionResult && (
                  <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-muted-foreground">
                    <div className="font-medium text-purple-300">Congestion Scenario Results</div>
                    <p className="mt-1">
                      Mode: {congestionResult.data_mode} · Live sensors:{" "}
                      {String(congestionResult.live_crowd_measurements_used)}
                    </p>
                  </div>
                )}

                {strategy === "prediction" && predictionResult && (
                  <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-3 text-muted-foreground">
                    <div className="font-medium text-teal-300">
                      ML Model: {predictionResult.model_version}
                    </div>
                    <p className="mt-1">
                      Training data: {predictionResult.training_data_type} · Features:{" "}
                      {Object.keys(predictionResult.features).length}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/80 italic">
                      {predictionResult.validation_limitation}
                    </p>
                  </div>
                )}

                {/* Ordered Path Steps */}
                <div>
                  <span className="font-semibold text-foreground">Path Sequence ({activePathNodeIds.length} Nodes)</span>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                    {activePathNodeIds.map((id, index) => {
                      const node = getNodeById(id);
                      return (
                        <React.Fragment key={id}>
                          <span
                            onClick={() => handleNodeClick(node!)}
                            className="cursor-pointer rounded bg-muted/60 px-2 py-0.5 hover:bg-emerald-500/20 hover:text-emerald-300"
                          >
                            {node?.code || id.slice(0, 8)}
                          </span>
                          {index < activePathNodeIds.length - 1 && (
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* Step Breakdown Table */}
                <div>
                  <span className="font-semibold text-foreground">Step Details</span>
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border/30">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-muted/40 font-medium text-muted-foreground sticky top-0">
                        <tr>
                          <th className="p-2">#</th>
                          <th className="p-2">From → To</th>
                          <th className="p-2 text-right">Distance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {(shortestResult?.steps ||
                          emergencyResult?.steps ||
                          evacuationResult?.steps ||
                          congestionResult?.steps ||
                          []).map((step, idx) => {
                          const fromN = getNodeById(step.from_node_id);
                          const toN = getNodeById(step.to_node_id);
                          return (
                            <tr key={`${step.edge_id}-${idx}`} className="hover:bg-muted/20">
                              <td className="p-2 font-mono text-muted-foreground">{idx + 1}</td>
                              <td className="p-2 font-mono">
                                {fromN?.code} → {toN?.code}
                              </td>
                              <td className="p-2 text-right font-mono text-emerald-400">
                                {step.distance_m}m
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
