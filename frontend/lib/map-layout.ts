/**
 * CAMPUS-SAFE V3 - Campus Map Architectural Layout & Collision Avoidance Engine
 *
 * Implements deterministic Point-Feature Label Placement (PFLP) on a spacious
 * 1000x620 architectural canvas with four distinct academic buildings, central
 * quad / Assembly Zone, and South Main Gate circulation network.
 */

import type { GraphNodeDefinition, GraphEdgeDefinition } from "../types/routes.ts";

export type FloorFilter = "all" | "ground" | "first";

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapLayoutResult {
  labelBoxes: Map<string, LabelBox>;
  badgeBoxes: Map<string, LabelBox>;
}

export interface RouteLineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const CAMPUS_VIEWBOX = {
  minX: 0,
  minY: 0,
  maxX: 1000,
  maxY: 620,
  width: 1000,
  height: 620,
};

/**
 * Returns compact, human-readable map labels for schematic rendering.
 * Preserves full node code and full name for tooltips and inspection cards.
 */
export function getCompactNodeLabel(code: string): string {
  switch (code) {
    case "ADM-G-ENT":
      return "ADM-ENT";
    case "ADM-G-COR":
      return "ADM-COR";
    case "ADM-G-JCT":
      return "ADM-JCT";
    case "ADM-G-ROOM":
      return "ADM-ROOM";
    case "ADM-G-STAIR":
      return "ADM-STAIR";
    case "ADM-G-EXIT":
      return "ADM-EXIT";
    case "ADM-1-STAIR":
      return "ADM-1-STR";
    case "ADM-1-COR":
      return "ADM-1-COR";
    case "ADM-1-ROOM":
      return "ADM-1-RM";
    case "ADM-1-EXIT":
      return "ADM-1-EXT";
    case "ACD-G-ENT":
      return "ACD-ENT";
    case "ACD-G-COR":
      return "ACD-COR";
    case "ACD-G-JCT":
      return "ACD-JCT";
    case "ACD-G-ROOM":
      return "ACD-ROOM";
    case "ACD-G-STAIR":
      return "ACD-STAIR";
    case "ACD-G-EXIT":
      return "ACD-EXIT";
    case "ACD-1-STAIR":
      return "ACD-1-STR";
    case "ACD-1-COR":
      return "ACD-1-COR";
    case "ACD-1-ROOM":
      return "ACD-1-RM";
    case "DEMO-WALKWAY":
      return "WALKWAY";
    case "DEMO-ASSEMBLY-NODE":
      return "ASSEMBLY";
    default:
      return code;
  }
}

/**
 * Calculates standard node radius in SVG coordinate space (1000x620).
 */
export function getNodeRadius(
  nodeType: string,
  isExit: boolean,
  isAssemblyPoint: boolean
): number {
  if (isAssemblyPoint) return 18;
  if (isExit) return 16;
  if (nodeType === "entrance") return 15;
  if (nodeType === "staircase") return 14;
  if (nodeType === "room") return 13;
  return 13;
}

/**
 * Presentation-layer layout mapping keyed by stable node UUID (and code fallback).
 * Completely separates visual coordinates from underlying graph connectivity and weights.
 *
 * Layout arrangement:
 * - Building 1 — CSE Department (1st Floor, North-West, x: 40..410, y: 40..250)
 * - Building 2 — IT Department (1st Floor, North-East, x: 590..960, y: 40..250)
 * - Building 3 — AI & ML Department (Ground Floor, South-West, x: 40..410, y: 290..500)
 * - Building 4 — CSBS Department (Ground Floor, South-East, x: 590..960, y: 290..500)
 * - Central Courtyard & Assembly Zone (Centre, x: 430..570, y: 40..480)
 * - Main Gate (South, x: 410..590, y: 505..585)
 */
export const PRESENTATION_NODE_COORDINATES: Record<string, { svgX: number; svgY: number }> = {
  // -------------------------------------------------------------------------
  // Building 1 — CSE Department (1st Floor, North-West)
  // -------------------------------------------------------------------------
  // ADM-1-STAIR: 1st floor staircase directly aligned with ground staircase below
  "20000000-0000-4000-8000-000000000007": { svgX: 110, svgY: 180 },
  "ADM-1-STAIR": { svgX: 110, svgY: 180 },

  // ADM-1-COR: 1st floor main computing corridor
  "20000000-0000-4000-8000-000000000008": { svgX: 200, svgY: 130 },
  "ADM-1-COR": { svgX: 200, svgY: 130 },

  // ADM-1-ROOM: Computing records and research room
  "20000000-0000-4000-8000-000000000009": { svgX: 290, svgY: 130 },
  "ADM-1-ROOM": { svgX: 290, svgY: 130 },

  // ADM-1-EXIT: 1st floor emergency fire escape
  "20000000-0000-4000-8000-000000000010": { svgX: 370, svgY: 130 },
  "ADM-1-EXIT": { svgX: 370, svgY: 130 },

  // -------------------------------------------------------------------------
  // Building 2 — IT Department (1st Floor, North-East)
  // -------------------------------------------------------------------------
  // ACD-1-ROOM: Software project & innovation lab
  "20000000-0000-4000-8000-000000000019": { svgX: 660, svgY: 130 },
  "ACD-1-ROOM": { svgX: 660, svgY: 130 },

  // ACD-1-COR: 1st floor main IT corridor
  "20000000-0000-4000-8000-000000000018": { svgX: 750, svgY: 130 },
  "ACD-1-COR": { svgX: 750, svgY: 130 },

  // ACD-1-STAIR: 1st floor staircase directly aligned with ground staircase below
  "20000000-0000-4000-8000-000000000017": { svgX: 850, svgY: 180 },
  "ACD-1-STAIR": { svgX: 850, svgY: 180 },

  // -------------------------------------------------------------------------
  // Building 3 — AI & ML Department (Ground Floor, South-West)
  // -------------------------------------------------------------------------
  // ADM-G-ENT: Department main entrance
  "20000000-0000-4000-8000-000000000001": { svgX: 80, svgY: 430 },
  "ADM-G-ENT": { svgX: 80, svgY: 430 },

  // ADM-G-COR: Ground intelligence corridor
  "20000000-0000-4000-8000-000000000002": { svgX: 160, svgY: 430 },
  "ADM-G-COR": { svgX: 160, svgY: 430 },

  // ADM-G-JCT: Central ground junction
  "20000000-0000-4000-8000-000000000003": { svgX: 240, svgY: 430 },
  "ADM-G-JCT": { svgX: 240, svgY: 430 },

  // ADM-G-ROOM: Administration office (north of junction inside building)
  "20000000-0000-4000-8000-000000000004": { svgX: 240, svgY: 345 },
  "ADM-G-ROOM": { svgX: 240, svgY: 345 },

  // ADM-G-STAIR: Ground staircase (connects to ADM-G-JCT and upstairs to ADM-1-STAIR)
  "20000000-0000-4000-8000-000000000005": { svgX: 110, svgY: 345 },
  "ADM-G-STAIR": { svgX: 110, svgY: 345 },

  // ADM-G-EXIT: West ground emergency exit (connects to Central Walkway)
  "20000000-0000-4000-8000-000000000006": { svgX: 370, svgY: 430 },
  "ADM-G-EXIT": { svgX: 370, svgY: 430 },

  // -------------------------------------------------------------------------
  // Building 4 — CSBS Department (Ground Floor, South-East)
  // -------------------------------------------------------------------------
  // ACD-G-ENT: Department main entrance (connects west to Central Walkway)
  "20000000-0000-4000-8000-000000000011": { svgX: 630, svgY: 430 },
  "ACD-G-ENT": { svgX: 630, svgY: 430 },

  // ACD-G-COR: Ground business systems corridor
  "20000000-0000-4000-8000-000000000012": { svgX: 710, svgY: 430 },
  "ACD-G-COR": { svgX: 710, svgY: 430 },

  // ACD-G-JCT: Central ground junction
  "20000000-0000-4000-8000-000000000013": { svgX: 790, svgY: 430 },
  "ACD-G-JCT": { svgX: 790, svgY: 430 },

  // ACD-G-ROOM: Seminar room (north of junction inside building)
  "20000000-0000-4000-8000-000000000014": { svgX: 790, svgY: 345 },
  "ACD-G-ROOM": { svgX: 790, svgY: 345 },

  // ACD-G-STAIR: Ground staircase (connects to ACD-G-JCT and upstairs to ACD-1-STAIR)
  "20000000-0000-4000-8000-000000000015": { svgX: 850, svgY: 345 },
  "ACD-G-STAIR": { svgX: 850, svgY: 345 },

  // ACD-G-EXIT: East ground emergency exit
  "20000000-0000-4000-8000-000000000016": { svgX: 910, svgY: 430 },
  "ACD-G-EXIT": { svgX: 910, svgY: 430 },

  // -------------------------------------------------------------------------
  // Central Courtyard & Assembly Zone
  // -------------------------------------------------------------------------
  // DEMO-WALKWAY: Central circulation junction
  "20000000-0000-4000-8000-000000000021": { svgX: 500, svgY: 390 },
  "DEMO-WALKWAY": { svgX: 500, svgY: 390 },

  // DEMO-ASSEMBLY-NODE: Designated campus emergency assembly point
  "20000000-0000-4000-8000-000000000020": { svgX: 500, svgY: 130 },
  "DEMO-ASSEMBLY-NODE": { svgX: 500, svgY: 130 },
};

/**
 * Fallback mapping from raw seed (x, y, floorId) to presentation coordinates.
 */
function getPresentationCoordByRaw(
  rawX: number,
  rawY: number,
  floorId: string | null
): { svgX: number; svgY: number } {
  // Building 1 (1st floor ADM)
  if (floorId?.endsWith("2")) {
    if (rawX === 14 && rawY === -4) return { svgX: 110, svgY: 180 }; // ADM-1-STAIR
    if (rawX === 14 && rawY === 2) return { svgX: 200, svgY: 130 };  // ADM-1-COR
    if (rawX === 21 && rawY === 2) return { svgX: 290, svgY: 130 };  // ADM-1-ROOM
    if (rawX === 24 && rawY === 2) return { svgX: 370, svgY: 130 };  // ADM-1-EXIT
  }

  // Building 2 (1st floor ACD)
  if (floorId?.endsWith("4")) {
    if (rawX === 73 && rawY === 2) return { svgX: 660, svgY: 130 };  // ACD-1-ROOM
    if (rawX === 65 && rawY === 2) return { svgX: 750, svgY: 130 };  // ACD-1-COR
    if (rawX === 65 && rawY === -4) return { svgX: 850, svgY: 180 }; // ACD-1-STAIR
  }

  // Building 3 (Ground floor ADM)
  if (floorId?.endsWith("1")) {
    if (rawX === 0 && rawY === 0) return { svgX: 80, svgY: 430 };    // ADM-G-ENT
    if (rawX === 8 && rawY === 0) return { svgX: 160, svgY: 430 };   // ADM-G-COR
    if (rawX === 14 && rawY === 0) return { svgX: 240, svgY: 430 };  // ADM-G-JCT
    if (rawX === 14 && rawY === 5) return { svgX: 240, svgY: 345 };  // ADM-G-ROOM
    if (rawX === 14 && rawY === -4) return { svgX: 110, svgY: 345 }; // ADM-G-STAIR
    if (rawX === 26 && rawY === 0) return { svgX: 370, svgY: 430 };  // ADM-G-EXIT
  }

  // Building 4 (Ground floor ACD)
  if (floorId?.endsWith("3")) {
    if (rawX === 50 && rawY === 0) return { svgX: 630, svgY: 430 };  // ACD-G-ENT
    if (rawX === 58 && rawY === 0) return { svgX: 710, svgY: 430 };  // ACD-G-COR
    if (rawX === 65 && rawY === 0) return { svgX: 790, svgY: 430 };  // ACD-G-JCT
    if (rawX === 65 && rawY === 6) return { svgX: 790, svgY: 345 };  // ACD-G-ROOM
    if (rawX === 65 && rawY === -4) return { svgX: 850, svgY: 345 }; // ACD-G-STAIR
    if (rawX === 77 && rawY === 0) return { svgX: 910, svgY: 430 };  // ACD-G-EXIT
  }

  // Outdoor
  if (rawX === 38 && rawY === 0) return { svgX: 500, svgY: 390 };    // DEMO-WALKWAY
  if (rawX === 45 && rawY === 20) return { svgX: 500, svgY: 130 };   // DEMO-ASSEMBLY-NODE

  // Default proportional fallback
  return { svgX: rawX * 10 + 100, svgY: 300 - rawY * 10 };
}

/**
 * Transforms node planar location to spacious SVG presentation coordinates (1000x620).
 * Preserves the underlying graph data while separating visual presentation.
 */
export function transformCoordinates(
  x: number,
  y: number,
  floorId: string | null,
  floorFilter?: FloorFilter,
  nodeId?: string
): { svgX: number; svgY: number } {
  if (nodeId && PRESENTATION_NODE_COORDINATES[nodeId]) {
    return PRESENTATION_NODE_COORDINATES[nodeId];
  }
  return getPresentationCoordByRaw(x, y, floorId);
}

/**
 * Distance from point (px, py) to axis-aligned box [x, y, width, height]
 */
export function pointToBoxDist(px: number, py: number, box: LabelBox): number {
  const dx = Math.max(box.x - px, 0, px - (box.x + box.width));
  const dy = Math.max(box.y - py, 0, py - (box.y + box.height));
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Area of intersection between two boxes
 */
export function boxOverlapArea(b1: LabelBox, b2: LabelBox): number {
  const ox = Math.max(0, Math.min(b1.x + b1.width, b2.x + b2.width) - Math.max(b1.x, b2.x));
  const oy = Math.max(0, Math.min(b1.y + b1.height, b2.y + b2.height) - Math.max(b1.y, b2.y));
  return ox * oy;
}

/**
 * Minimum distance between two non-overlapping boxes
 */
export function boxDistance(b1: LabelBox, b2: LabelBox): number {
  const dx = Math.max(b1.x - (b2.x + b2.width), b2.x - (b1.x + b1.width), 0);
  const dy = Math.max(b1.y - (b2.y + b2.height), b2.y - (b1.y + b1.height), 0);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Checks if a 2D line segment between (x1, y1) and (x2, y2) intersects or crosses a box.
 */
export function lineIntersectsBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: LabelBox
): boolean {
  if (
    x1 >= box.x &&
    x1 <= box.x + box.width &&
    y1 >= box.y &&
    y1 <= box.y + box.height
  ) {
    return true;
  }
  if (
    x2 >= box.x &&
    x2 <= box.x + box.width &&
    y2 >= box.y &&
    y2 <= box.y + box.height
  ) {
    return true;
  }

  const bx1 = box.x;
  const by1 = box.y;
  const bx2 = box.x + box.width;
  const by2 = box.y + box.height;

  function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  }

  function segmentsIntersect(
    ax: number, ay: number, bx: number, by: number,
    cx: number, cy: number, dx: number, dy: number
  ) {
    return (
      ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
      ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy)
    );
  }

  return (
    segmentsIntersect(x1, y1, x2, y2, bx1, by1, bx2, by1) ||
    segmentsIntersect(x1, y1, x2, y2, bx1, by2, bx2, by2) ||
    segmentsIntersect(x1, y1, x2, y2, bx1, by1, bx1, by2) ||
    segmentsIntersect(x1, y1, x2, y2, bx2, by1, bx2, by2)
  );
}

type CandidateDir = "T" | "B" | "R" | "L" | "TR" | "BR" | "TL" | "BL";

const defaultCandidateDirs: { dir: CandidateDir; baseScore: number }[] = [
  { dir: "B", baseScore: 0 },
  { dir: "T", baseScore: 1 },
  { dir: "R", baseScore: 3 },
  { dir: "L", baseScore: 3 },
  { dir: "BR", baseScore: 5 },
  { dir: "TR", baseScore: 6 },
  { dir: "BL", baseScore: 7 },
  { dir: "TL", baseScore: 8 },
];

/**
 * Returns prioritized placement directions tailored for each node in its building quadrant.
 */
function getCandidateDirs(code: string): { dir: CandidateDir; baseScore: number }[] {
  // Building 1 (1st floor North-West): Corridors and Rooms prefer Top
  if (code === "ADM-1-COR" || code === "ADM-1-ROOM" || code === "ADM-1-EXIT") {
    return [
      { dir: "T", baseScore: 0 },
      { dir: "TR", baseScore: 2 },
      { dir: "TL", baseScore: 3 },
      { dir: "B", baseScore: 10 },
      { dir: "R", baseScore: 12 },
      { dir: "L", baseScore: 12 },
      { dir: "BR", baseScore: 15 },
      { dir: "BL", baseScore: 15 },
    ];
  }
  if (code === "ADM-1-STAIR") {
    return [
      { dir: "L", baseScore: 0 },
      { dir: "TL", baseScore: 2 },
      { dir: "T", baseScore: 4 },
      { dir: "BL", baseScore: 8 },
      { dir: "R", baseScore: 15 },
      { dir: "B", baseScore: 18 },
      { dir: "TR", baseScore: 20 },
      { dir: "BR", baseScore: 20 },
    ];
  }

  // Building 2 (1st floor North-East): Corridors and Rooms prefer Top
  if (code === "ACD-1-ROOM" || code === "ACD-1-COR") {
    return [
      { dir: "T", baseScore: 0 },
      { dir: "TL", baseScore: 2 },
      { dir: "TR", baseScore: 3 },
      { dir: "B", baseScore: 10 },
      { dir: "R", baseScore: 12 },
      { dir: "L", baseScore: 12 },
      { dir: "BR", baseScore: 15 },
      { dir: "BL", baseScore: 15 },
    ];
  }
  if (code === "ACD-1-STAIR") {
    return [
      { dir: "R", baseScore: 0 },
      { dir: "TR", baseScore: 2 },
      { dir: "T", baseScore: 4 },
      { dir: "BR", baseScore: 8 },
      { dir: "L", baseScore: 15 },
      { dir: "B", baseScore: 18 },
      { dir: "TL", baseScore: 20 },
      { dir: "BL", baseScore: 20 },
    ];
  }

  // Building 3 (Ground floor South-West):
  if (code === "ADM-G-ROOM") {
    return [
      { dir: "T", baseScore: 0 },
      { dir: "TR", baseScore: 2 },
      { dir: "TL", baseScore: 3 },
      { dir: "R", baseScore: 10 },
      { dir: "L", baseScore: 10 },
      { dir: "B", baseScore: 15 },
      { dir: "BR", baseScore: 16 },
      { dir: "BL", baseScore: 16 },
    ];
  }
  if (code === "ADM-G-STAIR") {
    return [
      { dir: "L", baseScore: 0 },
      { dir: "BL", baseScore: 2 },
      { dir: "TL", baseScore: 3 },
      { dir: "T", baseScore: 8 },
      { dir: "B", baseScore: 10 },
      { dir: "R", baseScore: 18 },
      { dir: "TR", baseScore: 20 },
      { dir: "BR", baseScore: 20 },
    ];
  }
  if (code === "ADM-G-ENT") {
    return [
      { dir: "L", baseScore: 0 },
      { dir: "BL", baseScore: 2 },
      { dir: "B", baseScore: 4 },
      { dir: "TL", baseScore: 6 },
      { dir: "T", baseScore: 10 },
      { dir: "R", baseScore: 15 },
      { dir: "BR", baseScore: 18 },
      { dir: "TR", baseScore: 20 },
    ];
  }
  if (code === "ADM-G-COR" || code === "ADM-G-JCT" || code === "ADM-G-EXIT") {
    return [
      { dir: "B", baseScore: 0 },
      { dir: "BL", baseScore: 2 },
      { dir: "BR", baseScore: 3 },
      { dir: "R", baseScore: 10 },
      { dir: "L", baseScore: 12 },
      { dir: "T", baseScore: 15 },
      { dir: "TR", baseScore: 18 },
      { dir: "TL", baseScore: 18 },
    ];
  }

  // Building 4 (Ground floor South-East):
  if (code === "ACD-G-ROOM") {
    return [
      { dir: "T", baseScore: 0 },
      { dir: "TL", baseScore: 2 },
      { dir: "TR", baseScore: 3 },
      { dir: "R", baseScore: 10 },
      { dir: "L", baseScore: 10 },
      { dir: "B", baseScore: 15 },
      { dir: "BR", baseScore: 16 },
      { dir: "BL", baseScore: 16 },
    ];
  }
  if (code === "ACD-G-STAIR") {
    return [
      { dir: "R", baseScore: 0 },
      { dir: "BR", baseScore: 2 },
      { dir: "TR", baseScore: 3 },
      { dir: "T", baseScore: 8 },
      { dir: "B", baseScore: 10 },
      { dir: "L", baseScore: 18 },
      { dir: "TL", baseScore: 20 },
      { dir: "BL", baseScore: 20 },
    ];
  }
  if (code === "ACD-G-EXIT") {
    return [
      { dir: "R", baseScore: 0 },
      { dir: "BR", baseScore: 2 },
      { dir: "B", baseScore: 4 },
      { dir: "TR", baseScore: 6 },
      { dir: "T", baseScore: 10 },
      { dir: "L", baseScore: 15 },
      { dir: "BL", baseScore: 18 },
      { dir: "TL", baseScore: 20 },
    ];
  }
  if (code === "ACD-G-ENT" || code === "ACD-G-COR" || code === "ACD-G-JCT") {
    return [
      { dir: "B", baseScore: 0 },
      { dir: "BR", baseScore: 2 },
      { dir: "BL", baseScore: 3 },
      { dir: "R", baseScore: 10 },
      { dir: "L", baseScore: 12 },
      { dir: "T", baseScore: 15 },
      { dir: "TR", baseScore: 18 },
      { dir: "TL", baseScore: 18 },
    ];
  }

  // Central Walkway and Assembly Zone
  if (code === "DEMO-WALKWAY") {
    return [
      { dir: "R", baseScore: 0 },
      { dir: "BR", baseScore: 2 },
      { dir: "TR", baseScore: 3 },
      { dir: "B", baseScore: 8 },
      { dir: "L", baseScore: 12 },
      { dir: "T", baseScore: 15 },
      { dir: "BL", baseScore: 18 },
      { dir: "TL", baseScore: 18 },
    ];
  }
  if (code === "DEMO-ASSEMBLY-NODE") {
    return [
      { dir: "R", baseScore: 0 },
      { dir: "TR", baseScore: 2 },
      { dir: "BR", baseScore: 3 },
      { dir: "B", baseScore: 8 },
      { dir: "T", baseScore: 10 },
      { dir: "L", baseScore: 15 },
      { dir: "TL", baseScore: 18 },
      { dir: "BL", baseScore: 18 },
    ];
  }

  return defaultCandidateDirs;
}

function getCandidateBox(
  svgX: number,
  svgY: number,
  radius: number,
  width: number,
  height: number,
  dir: CandidateDir
): LabelBox {
  const gap = 5;
  switch (dir) {
    case "T":
      return { x: svgX - width / 2, y: svgY - radius - gap - height, width, height };
    case "B":
      return { x: svgX - width / 2, y: svgY + radius + gap, width, height };
    case "R":
      return { x: svgX + radius + gap, y: svgY - height / 2, width, height };
    case "L":
      return { x: svgX - radius - gap - width, y: svgY - height / 2, width, height };
    case "TR":
      return { x: svgX + radius + gap * 0.7, y: svgY - radius - gap * 0.7 - height, width, height };
    case "BR":
      return { x: svgX + radius + gap * 0.7, y: svgY + radius + gap * 0.7, width, height };
    case "TL":
      return { x: svgX - radius - gap * 0.7 - width, y: svgY - radius - gap * 0.7 - height, width, height };
    case "BL":
      return { x: svgX - radius - gap * 0.7 - width, y: svgY + radius + gap * 0.7, width, height };
  }
}

function getBadgeCandidateBox(
  svgX: number,
  svgY: number,
  radius: number,
  dir: CandidateDir
): LabelBox {
  const badgeW = 42;
  const badgeH = 18;
  return getCandidateBox(svgX, svgY, radius, badgeW, badgeH, dir);
}

/**
 * Computes deterministic, collision-avoiding positions for all visible labels and markers
 * on the spacious 1000x620 canvas.
 */
export function computeAllLabelPositions(
  visibleNodes: GraphNodeDefinition[],
  floorFilter: FloorFilter,
  startNodeId?: string,
  destNodeId?: string,
  activeEdgeIds?: string[],
  allEdges?: GraphEdgeDefinition[]
): MapLayoutResult {
  const nodeInfo = visibleNodes.map((n) => {
    const { svgX, svgY } = transformCoordinates(n.x, n.y, n.floor_id, floorFilter, n.id);
    const radius = getNodeRadius(n.node_type, n.is_exit, n.is_assembly_point);
    const text = getCompactNodeLabel(n.code);
    const width = Math.max(50, text.length * 6.5 + 16);
    const height = 18;
    const isStart = n.id === startNodeId;
    const isDest = n.id === destNodeId;
    return {
      node: n,
      svgX,
      svgY,
      radius,
      text,
      width,
      height,
      isStart,
      isDest,
    };
  });

  // Calculate active route line segments for route avoidance
  const activeSegments: RouteLineSegment[] = [];
  if (activeEdgeIds && activeEdgeIds.length > 0 && allEdges) {
    const edgeIdSet = new Set(activeEdgeIds);
    for (const edge of allEdges) {
      if (!edgeIdSet.has(edge.id)) continue;
      const fromNode = nodeInfo.find((n) => n.node.id === edge.from_node_id);
      const toNode = nodeInfo.find((n) => n.node.id === edge.to_node_id);
      if (fromNode && toNode) {
        activeSegments.push({
          x1: fromNode.svgX,
          y1: fromNode.svgY,
          x2: toNode.svgX,
          y2: toNode.svgY,
        });
      }
    }
  }

  const { minX, maxX, minY, maxY } = CAMPUS_VIEWBOX;

  // =========================================================================
  // PHASE 1: PLACE CRITICAL MARKERS (START & DEST BADGES) FIRST
  // Placed on the opposite side of primary label direction.
  // =========================================================================
  const placedBadges = new Array<LabelBox | null>(nodeInfo.length).fill(null);

  for (let idx = 0; idx < nodeInfo.length; idx++) {
    const info = nodeInfo[idx];
    if (!info.isStart && !info.isDest) continue;

    // Badges prefer opposite direction to label (e.g. if node prefers Top, badge takes Bottom)
    const primaryDir = getCandidateDirs(info.node.code)[0]?.dir || "B";
    const oppositeDirMap: Record<CandidateDir, CandidateDir[]> = {
      T: ["B", "BR", "BL", "R", "L"],
      B: ["T", "TR", "TL", "R", "L"],
      L: ["R", "TR", "BR", "T", "B"],
      R: ["L", "TL", "BL", "T", "B"],
      TR: ["BL", "B", "L"],
      TL: ["BR", "B", "R"],
      BR: ["TL", "T", "L"],
      BL: ["TR", "T", "R"],
    };

    const candidateBadgeDirs = oppositeDirMap[primaryDir] || ["B", "T", "R", "L"];

    let bestBadge: LabelBox | null = null;
    let bestScore = Infinity;

    for (let i = 0; i < candidateBadgeDirs.length; i++) {
      const dir = candidateBadgeDirs[i];
      const cand = getBadgeCandidateBox(info.svgX, info.svgY, info.radius, dir);
      let score = i * 2;

      // Viewport bounds
      if (cand.x < minX) score += (minX - cand.x) * 10000;
      if (cand.x + cand.width > maxX) score += (cand.x + cand.width - maxX) * 10000;
      if (cand.y < minY) score += (minY - cand.y) * 10000;
      if (cand.y + cand.height > maxY) score += (cand.y + cand.height - maxY) * 10000;

      // Must never overlap ANY node circle
      for (let j = 0; j < nodeInfo.length; j++) {
        const other = nodeInfo[j];
        const dist = pointToBoxDist(other.svgX, other.svgY, cand);
        const reqDist = other.radius + 2;
        if (dist < reqDist) {
          score += (reqDist - dist) * 10000;
        }
      }

      if (score < bestScore) {
        bestScore = score;
        bestBadge = cand;
      }
    }

    placedBadges[idx] = bestBadge;
  }

  // =========================================================================
  // PHASE 2: PLACE NODE LABELS WITH FULL COLLISION AVOIDANCE
  // =========================================================================
  function scoreLabelBox(
    box: LabelBox,
    currIdx: number,
    placedLabels: (LabelBox | null)[]
  ): number {
    let score = 0;

    // Viewport bounds
    if (box.x < minX) score += (minX - box.x) * 10000;
    if (box.x + box.width > maxX) score += (box.x + box.width - maxX) * 10000;
    if (box.y < minY) score += (minY - box.y) * 10000;
    if (box.y + box.height > maxY) score += (box.y + box.height - maxY) * 10000;

    // Node circles: fatal penalty if inside circle radius
    for (let j = 0; j < nodeInfo.length; j++) {
      const other = nodeInfo[j];
      const dist = pointToBoxDist(other.svgX, other.svgY, box);
      if (j === currIdx) {
        const reqDist = other.radius + 1.5;
        if (dist < reqDist) score += (reqDist - dist) * 5000;
      } else {
        if (dist < other.radius) {
          score += (other.radius - dist + 1) * 50000;
        } else if (dist < other.radius + 4) {
          score += (other.radius + 4 - dist) * 5000;
        }
      }
    }

    // Overlap with placed badges (START and DEST badges are strictly protected)
    for (let k = 0; k < placedBadges.length; k++) {
      const badge = placedBadges[k];
      if (!badge) continue;
      const area = boxOverlapArea(box, badge);
      if (area > 0) {
        score += area * 50000;
      } else {
        const d = boxDistance(box, badge);
        if (d < 3) score += (3 - d) * 500;
      }
    }

    // Overlap with other placed labels
    for (let k = 0; k < placedLabels.length; k++) {
      if (k === currIdx) continue;
      const otherBox = placedLabels[k];
      if (!otherBox) continue;
      const area = boxOverlapArea(box, otherBox);
      if (area > 0) {
        score += area * 40000;
      } else {
        const d = boxDistance(box, otherBox);
        if (d < 3) score += (3 - d) * 300;
      }
    }

    // Route path avoidance
    for (const seg of activeSegments) {
      if (lineIntersectsBox(seg.x1, seg.y1, seg.x2, seg.y2, box)) {
        score += 200;
      }
    }

    return score;
  }

  const placedLabels = new Array<LabelBox | null>(nodeInfo.length).fill(null);

  // Greedy pass
  for (let idx = 0; idx < nodeInfo.length; idx++) {
    const info = nodeInfo[idx];
    let bestCand: LabelBox | null = null;
    let bestScore = Infinity;

    for (const { dir, baseScore } of getCandidateDirs(info.node.code)) {
      const cand = getCandidateBox(info.svgX, info.svgY, info.radius, info.width, info.height, dir);
      const penalty = scoreLabelBox(cand, idx, placedLabels) + baseScore;
      if (penalty < bestScore) {
        bestScore = penalty;
        bestCand = cand;
      }
    }
    placedLabels[idx] = bestCand;
  }

  // Relaxation pass
  for (let iter = 0; iter < 2; iter++) {
    for (let idx = 0; idx < nodeInfo.length; idx++) {
      const info = nodeInfo[idx];
      let bestCand = placedLabels[idx]!;
      let bestScore = scoreLabelBox(bestCand, idx, placedLabels);

      for (const { dir, baseScore } of getCandidateDirs(info.node.code)) {
        const cand = getCandidateBox(info.svgX, info.svgY, info.radius, info.width, info.height, dir);
        const penalty = scoreLabelBox(cand, idx, placedLabels) + baseScore;
        if (penalty < bestScore) {
          bestScore = penalty;
          bestCand = cand;
        }
      }
      placedLabels[idx] = bestCand;
    }
  }

  const labelResult = new Map<string, LabelBox>();
  const badgeResult = new Map<string, LabelBox>();
  for (let i = 0; i < nodeInfo.length; i++) {
    labelResult.set(nodeInfo[i].node.id, placedLabels[i]!);
    if (placedBadges[i]) {
      badgeResult.set(nodeInfo[i].node.id, placedBadges[i]!);
    }
  }

  return { labelBoxes: labelResult, badgeBoxes: badgeResult };
}
