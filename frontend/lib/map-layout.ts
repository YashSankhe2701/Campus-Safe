/**
 * CAMPUS-SAFE - Campus Map Geometric Layout & Collision Avoidance Engine
 *
 * Implements deterministic Point-Feature Label Placement (PFLP) with candidate scoring
 * for campus topology nodes, labels, START/DEST markers, and active route lines.
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
 * Calculates standard node radius in SVG coordinate space.
 */
export function getNodeRadius(
  nodeType: string,
  isExit: boolean,
  isAssemblyPoint: boolean
): number {
  if (isAssemblyPoint) return 2.4;
  if (isExit) return 2.2;
  if (nodeType === "entrance") return 2.0;
  if (nodeType === "staircase") return 1.8;
  if (nodeType === "room") return 1.7;
  return 1.6;
}

/**
 * Transform seed planar coordinates to SVG coordinates.
 * Inverts Y so positive Y appears towards top of canvas.
 * Slightly offsets First Floor nodes upwards in 'all' view to disambiguate planar projections.
 */
export function transformCoordinates(
  x: number,
  y: number,
  floorId: string | null,
  floorFilter: FloorFilter
): { svgX: number; svgY: number } {
  let yOffset = 0;
  if (floorFilter === "all" && (floorId?.endsWith("2") || floorId?.endsWith("4"))) {
    yOffset = -3.2;
  }
  const svgX = x + 8;
  const svgY = 24 - (y + yOffset);
  return { svgX, svgY };
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

function getCandidateDirs(code: string): { dir: CandidateDir; baseScore: number }[] {
  // Junctions and corridors at x=14 and x=65:
  if (code === "ADM-1-COR" || code === "ACD-1-COR") {
    return [
      { dir: "R", baseScore: 0 },
      { dir: "TR", baseScore: 2 },
      { dir: "BR", baseScore: 3 },
      { dir: "T", baseScore: 6 },
      { dir: "B", baseScore: 7 },
      { dir: "L", baseScore: 15 },
      { dir: "TL", baseScore: 16 },
      { dir: "BL", baseScore: 17 },
    ];
  }
  if (code === "ADM-G-JCT" || code === "ACD-G-JCT") {
    return [
      { dir: "L", baseScore: 0 },
      { dir: "TL", baseScore: 2 },
      { dir: "BL", baseScore: 3 },
      { dir: "B", baseScore: 6 },
      { dir: "T", baseScore: 7 },
      { dir: "R", baseScore: 15 },
      { dir: "TR", baseScore: 16 },
      { dir: "BR", baseScore: 17 },
    ];
  }

  // Clustered room nodes (ADM-1-ROOM is between ADM-1-COR and ADM-1-EXIT):
  // Vertically place so it never extends horizontally into neighboring circles!
  if (code === "ADM-1-ROOM" || code === "ACD-1-ROOM") {
    return [
      { dir: "B", baseScore: 0 },
      { dir: "T", baseScore: 1 },
      { dir: "BL", baseScore: 3 },
      { dir: "TL", baseScore: 4 },
      { dir: "R", baseScore: 15 },
      { dir: "TR", baseScore: 16 },
      { dir: "BR", baseScore: 17 },
      { dir: "L", baseScore: 18 },
    ];
  }

  // Northward rooms: prefer Top
  if (code === "ADM-G-ROOM" || code === "ACD-G-ROOM") {
    return [
      { dir: "T", baseScore: 0 },
      { dir: "TL", baseScore: 2 },
      { dir: "TR", baseScore: 3 },
      { dir: "L", baseScore: 6 },
      { dir: "R", baseScore: 7 },
      { dir: "B", baseScore: 15 },
      { dir: "BL", baseScore: 16 },
      { dir: "BR", baseScore: 17 },
    ];
  }

  // Staircases: prefer Right
  if (code.includes("STAIR")) {
    return [
      { dir: "R", baseScore: 0 },
      { dir: "TR", baseScore: 2 },
      { dir: "BR", baseScore: 3 },
      { dir: "B", baseScore: 5 },
      { dir: "T", baseScore: 6 },
      { dir: "L", baseScore: 10 },
      { dir: "TL", baseScore: 12 },
      { dir: "BL", baseScore: 14 },
    ];
  }

  // Exits
  if (code === "ADM-1-EXIT") {
    return [
      { dir: "T", baseScore: 0 },
      { dir: "TR", baseScore: 2 },
      { dir: "R", baseScore: 4 },
      { dir: "BR", baseScore: 6 },
      { dir: "B", baseScore: 8 },
      { dir: "L", baseScore: 15 },
      { dir: "TL", baseScore: 16 },
      { dir: "BL", baseScore: 17 },
    ];
  }
  if (code === "ADM-G-EXIT" || code === "ACD-G-EXIT") {
    return [
      { dir: "R", baseScore: 0 },
      { dir: "BR", baseScore: 1 },
      { dir: "B", baseScore: 3 },
      { dir: "TR", baseScore: 5 },
      { dir: "T", baseScore: 8 },
      { dir: "L", baseScore: 15 },
      { dir: "TL", baseScore: 16 },
      { dir: "BL", baseScore: 17 },
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
  const gap = 0.5;
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
      return { x: svgX + radius + gap * 0.6, y: svgY - radius - gap - height * 0.8, width, height };
    case "BR":
      return { x: svgX + radius + gap * 0.6, y: svgY + radius + gap * 0.4, width, height };
    case "TL":
      return { x: svgX - radius - gap * 0.6 - width, y: svgY - radius - gap - height * 0.8, width, height };
    case "BL":
      return { x: svgX - radius - gap * 0.6 - width, y: svgY + radius + gap * 0.4, width, height };
  }
}

function getBadgeCandidateBox(
  svgX: number,
  svgY: number,
  radius: number,
  dir: CandidateDir
): LabelBox {
  const badgeW = 4.2;
  const badgeH = 1.6;
  return getCandidateBox(svgX, svgY, radius, badgeW, badgeH, dir);
}

/**
 * Computes deterministic, collision-avoiding positions for all visible labels and markers.
 * Highest priority is granted to START and DEST badges, followed by route obstruction avoidance.
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
    const { svgX, svgY } = transformCoordinates(n.x, n.y, n.floor_id, floorFilter);
    const radius = getNodeRadius(n.node_type, n.is_exit, n.is_assembly_point);
    const text = getCompactNodeLabel(n.code);
    const width = Math.max(4.2, text.length * 0.65 + 1.0);
    const height = 1.9;
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

  // Calculate active route line segments for collision avoidance
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

  function getBadgeCandidateDirs(info: typeof nodeInfo[0]): { dir: CandidateDir; baseScore: number }[] {
    const dirs = getCandidateDirs(info.node.code);

    const hasNeighborStrictAbove = nodeInfo.some(
      (o) => o !== info && Math.abs(o.svgX - info.svgX) < 1.8 && o.svgY < info.svgY && info.svgY - o.svgY < 3.2
    );
    const hasNeighborStrictBelow = nodeInfo.some(
      (o) => o !== info && Math.abs(o.svgX - info.svgX) < 1.8 && o.svgY > info.svgY && o.svgY - info.svgY < 3.2
    );
    const hasNeighborStrictLeft = nodeInfo.some(
      (o) => o !== info && Math.abs(o.svgY - info.svgY) < 1.8 && o.svgX < info.svgX && info.svgX - o.svgX < 3.5
    );
    const hasNeighborStrictRight = nodeInfo.some(
      (o) => o !== info && Math.abs(o.svgY - info.svgY) < 1.8 && o.svgX > info.svgX && o.svgX - info.svgX < 3.5
    );

    return dirs.filter(({ dir }) => {
      if (hasNeighborStrictAbove && (dir === "T" || dir === "TL" || dir === "TR")) return false;
      if (hasNeighborStrictBelow && (dir === "B" || dir === "BL" || dir === "BR")) return false;
      if (hasNeighborStrictLeft && (dir === "L" || dir === "TL" || dir === "BL")) return false;
      if (hasNeighborStrictRight && (dir === "R" || dir === "TR" || dir === "BR")) return false;
      return true;
    });
  }

  const minX = -4;
  const maxX = 100;
  const minY = -4;
  const maxY = 38;

  // =========================================================================
  // PHASE 1: PLACE CRITICAL MARKERS (START & DEST BADGES) FIRST
  // Highest placement priority; locked before ordinary labels are computed.
  // =========================================================================
  const placedBadges = new Array<LabelBox | null>(nodeInfo.length).fill(null);

  for (let idx = 0; idx < nodeInfo.length; idx++) {
    const info = nodeInfo[idx];
    if (!info.isStart && !info.isDest) continue;

    let bestBadge: LabelBox | null = null;
    let bestScore = Infinity;

    for (const { dir, baseScore } of getBadgeCandidateDirs(info)) {
      const cand = getBadgeCandidateBox(info.svgX, info.svgY, info.radius, dir);
      let score = baseScore;

      // Viewport bounds
      if (cand.x < minX) score += (minX - cand.x) * 25000;
      if (cand.x + cand.width > maxX) score += (cand.x + cand.width - maxX) * 25000;
      if (cand.y < minY) score += (minY - cand.y) * 25000;
      if (cand.y + cand.height > maxY) score += (cand.y + cand.height - maxY) * 25000;

      // Must never overlap ANY node circle
      for (let j = 0; j < nodeInfo.length; j++) {
        const other = nodeInfo[j];
        const dist = pointToBoxDist(other.svgX, other.svgY, cand);
        const reqDist = other.radius + 0.35;
        if (dist < reqDist) {
          score += (reqDist - dist) * 25000;
        }
      }

      // Avoid active route paths
      for (const seg of activeSegments) {
        if (lineIntersectsBox(seg.x1, seg.y1, seg.x2, seg.y2, cand)) {
          score += 350;
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
  // PHASE 2: PLACE NODE LABELS WITH FULL COLLISION & ROUTE AVOIDANCE
  // =========================================================================
  function scoreLabelBox(
    box: LabelBox,
    currIdx: number,
    placedLabels: (LabelBox | null)[]
  ): number {
    let score = 0;

    // Viewport bounds
    if (box.x < minX) score += (minX - box.x) * 25000;
    if (box.x + box.width > maxX) score += (box.x + box.width - maxX) * 25000;
    if (box.y < minY) score += (minY - box.y) * 25000;
    if (box.y + box.height > maxY) score += (box.y + box.height - maxY) * 25000;

    // Node circles: fatal penalty if inside circle radius, strong penalty if within buffer
    for (let j = 0; j < nodeInfo.length; j++) {
      const other = nodeInfo[j];
      const dist = pointToBoxDist(other.svgX, other.svgY, box);
      if (j === currIdx) {
        // Own node: standard clearance
        const reqDist = other.radius + 0.2;
        if (dist < reqDist) score += (reqDist - dist) * 15000;
      } else {
        // Other node circles: MUST NOT overlap
        if (dist < other.radius) {
          score += (other.radius - dist + 1) * 60000; // Fatal overlap penalty
        } else if (dist < other.radius + 0.45) {
          score += (other.radius + 0.45 - dist) * 12000;
        }
      }
    }

    // Overlap with placed badges (START and DEST badges are strictly protected)
    for (let k = 0; k < placedBadges.length; k++) {
      const badge = placedBadges[k];
      if (!badge) continue;
      const area = boxOverlapArea(box, badge);
      if (area > 0) {
        score += area * 80000; // Fatal penalty - no label may ever touch a critical marker
      } else {
        const d = boxDistance(box, badge);
        if (d < 0.4) score += (0.4 - d) * 400;
      }
    }

    // Overlap with other placed labels
    for (let k = 0; k < placedLabels.length; k++) {
      if (k === currIdx) continue;
      const otherBox = placedLabels[k];
      if (!otherBox) continue;
      const area = boxOverlapArea(box, otherBox);
      if (area > 0) {
        score += area * 35000;
      } else {
        const d = boxDistance(box, otherBox);
        if (d < 0.3) score += (0.3 - d) * 200;
      }
    }

    // Route path avoidance: nudge labels away from glowing route lines & arrows
    for (const seg of activeSegments) {
      if (lineIntersectsBox(seg.x1, seg.y1, seg.x2, seg.y2, box)) {
        score += 450;
      }
    }

    return score;
  }

  // Priority ordering by local density
  const densities = nodeInfo.map((info, idx) => {
    let count = 0;
    for (let j = 0; j < nodeInfo.length; j++) {
      if (idx === j) continue;
      const d = Math.hypot(info.svgX - nodeInfo[j].svgX, info.svgY - nodeInfo[j].svgY);
      if (d < 10) count += (10 - d);
    }
    return { idx, count };
  });

  densities.sort((a, b) => b.count - a.count);

  const placedLabels = new Array<LabelBox | null>(nodeInfo.length).fill(null);

  // Pass 1: Greedy placement
  for (const { idx } of densities) {
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

  // Pass 2 & 3: Relaxation passes to settle mutual constraints
  for (let iter = 0; iter < 3; iter++) {
    for (const { idx } of densities) {
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
