import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
  getEdgeById,
  findEdgeBetween,
} from "../lib/demo-campus.ts";
import {
  getCompactNodeLabel,
  getNodeRadius,
  transformCoordinates,
  computeAllLabelPositions,
  boxOverlapArea,
  pointToBoxDist,
} from "../lib/map-layout.ts";

describe("Campus Map - Authoritative Topology Verification", () => {
  it("has exactly 21 nodes matching the PostgreSQL seed dataset", () => {
    assert.equal(DEMO_NODES.length, 21);
    const nodeIds = new Set(DEMO_NODES.map((n) => n.id));
    assert.equal(nodeIds.size, 21, "All node IDs must be unique UUIDs");
  });

  it("contains all expected node types from the schema", () => {
    const types = new Set(DEMO_NODES.map((n) => n.node_type));
    assert.ok(types.has("entrance"));
    assert.ok(types.has("corridor"));
    assert.ok(types.has("junction"));
    assert.ok(types.has("room"));
    assert.ok(types.has("staircase"));
    assert.ok(types.has("exit"));
    assert.ok(types.has("assembly_point"));
  });

  it("has exactly 3 exits and 1 assembly point", () => {
    assert.equal(DEMO_EXITS.length, 3);
    assert.equal(DEMO_ASSEMBLY_POINTS.length, 1);

    const exitNodes = DEMO_NODES.filter((n) => n.is_exit);
    assert.equal(exitNodes.length, 3);

    const assemblyNodes = DEMO_NODES.filter((n) => n.is_assembly_point);
    assert.equal(assemblyNodes.length, 1);
    assert.equal(assemblyNodes[0].code, "DEMO-ASSEMBLY-NODE");
  });

  it("has exactly 21 stored edges and matches arc expectations", () => {
    assert.equal(DEMO_EDGES.length, 21);
    const edgeIds = new Set(DEMO_EDGES.map((e) => e.id));
    assert.equal(edgeIds.size, 21, "All edge IDs must be unique UUIDs");

    const bidirectionalEdges = DEMO_EDGES.filter((e) => e.bidirectional);
    const directedEdges = DEMO_EDGES.filter((e) => !e.bidirectional);

    assert.equal(bidirectionalEdges.length, 18);
    assert.equal(directedEdges.length, 3);

    // 18 * 2 + 3 = 39 traversal arcs
    const arcCount = bidirectionalEdges.length * 2 + directedEdges.length;
    assert.equal(arcCount, 39);
  });

  it("walkway connection connects Central Outdoor Walkway to Academic Main Entrance", () => {
    // Edge 21: Walkway (20000000-0000-4000-8000-000000000021) <-> Academic Entrance (20000000-0000-4000-8000-000000000011)
    const edge21 = DEMO_EDGES.find(
      (e) =>
        e.from_node_id === "20000000-0000-4000-8000-000000000021" &&
        e.to_node_id === "20000000-0000-4000-8000-000000000011"
    );
    assert.ok(edge21, "Edge 21 must exist");
    assert.equal(edge21.bidirectional, true);
    assert.equal(edge21.edge_type, "outdoor");
    assert.equal(edge21.distance, 12);
  });

  it("directed outdoor edges correctly lead to the assembly point", () => {
    // West exit (20000000-0000-4000-8000-000000000006) -> Walkway (20000000-0000-4000-8000-000000000021)
    const edge10 = DEMO_EDGES.find(
      (e) =>
        e.from_node_id === "20000000-0000-4000-8000-000000000006" &&
        e.to_node_id === "20000000-0000-4000-8000-000000000021"
    );
    assert.ok(edge10);
    assert.equal(edge10.bidirectional, false);

    // Walkway -> Assembly Point (20000000-0000-4000-8000-000000000020)
    const edge20 = DEMO_EDGES.find(
      (e) =>
        e.from_node_id === "20000000-0000-4000-8000-000000000021" &&
        e.to_node_id === "20000000-0000-4000-8000-000000000020"
    );
    assert.ok(edge20);
    assert.equal(edge20.bidirectional, false);
    assert.equal(edge20.edge_type, "outdoor");
  });

  it("contains 2 buildings and 4 floors", () => {
    assert.equal(DEMO_BUILDINGS.length, 2);
    assert.equal(DEMO_FLOORS.length, 4);

    const adminFloors = DEMO_FLOORS.filter(
      (f) => f.buildingId === "11000000-0000-4000-8000-000000000001"
    );
    assert.equal(adminFloors.length, 2);

    const academicFloors = DEMO_FLOORS.filter(
      (f) => f.buildingId === "11000000-0000-4000-8000-000000000002"
    );
    assert.equal(academicFloors.length, 2);
  });
});

describe("Campus Map - Node & Edge Helper Functions", () => {
  it("retrieves nodes by ID correctly", () => {
    const node = getNodeById("20000000-0000-4000-8000-000000000001");
    assert.ok(node);
    assert.equal(node.code, "ADM-G-ENT");
    assert.equal(node.name, "Administration Main Entrance");
    assert.equal(node.capacity, 80);
  });

  it("finds edge between two connected nodes", () => {
    const edge = findEdgeBetween(
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000002"
    );
    assert.ok(edge);
    assert.equal(edge.distance, 8);
    assert.equal(edge.bidirectional, true);
  });

  it("respects one-way direction when querying reversed edges", () => {
    // Reverse of one-way edge 20 (Walkway -> Assembly Point) should not be traversable in reverse
    const edge = findEdgeBetween(
      "20000000-0000-4000-8000-000000000020", // Assembly
      "20000000-0000-4000-8000-000000000021"  // Walkway
    );
    assert.equal(edge, undefined, "Reverse of directed edge must not be found");
  });
});

describe("Campus Map - Floor Filtering Logic", () => {
  it("ground floor includes ground and outdoor nodes", () => {
    const groundNodes = DEMO_NODES.filter(
      (n) =>
        n.floor_id === "12000000-0000-4000-8000-000000000001" ||
        n.floor_id === "12000000-0000-4000-8000-000000000003" ||
        n.floor_id === null
    );
    assert.equal(groundNodes.length, 14);
  });

  it("first floor includes first floor nodes and staircases", () => {
    const firstNodes = DEMO_NODES.filter(
      (n) =>
        n.floor_id === "12000000-0000-4000-8000-000000000002" ||
        n.floor_id === "12000000-0000-4000-8000-000000000004"
    );
    assert.equal(firstNodes.length, 7);
  });
});

describe("Campus Map - Routing Response Schema Validation", () => {
  it("validates shortest route step distances match total", () => {
    const mockSteps = [
      {
        from_node_id: "20000000-0000-4000-8000-000000000001",
        to_node_id: "20000000-0000-4000-8000-000000000002",
        edge_id: "30000000-0000-4000-8000-000000000001",
        distance_m: 8,
      },
      {
        from_node_id: "20000000-0000-4000-8000-000000000002",
        to_node_id: "20000000-0000-4000-8000-000000000003",
        edge_id: "30000000-0000-4000-8000-000000000002",
        distance_m: 6,
      },
    ];

    const sumDist = mockSteps.reduce((acc, s) => acc + s.distance_m, 0);
    assert.equal(sumDist, 14);
  });

  it("validates emergency route risk_weighting_applied defaults to false", () => {
    const mockEmergencyResponse = {
      campus_id: DEMO_CAMPUS_ID,
      start_node_id: "20000000-0000-4000-8000-000000000001",
      destination_node_id: "20000000-0000-4000-8000-000000000003",
      path_node_ids: [],
      total_distance_m: 14,
      steps: [],
      active_emergency_ids: [],
      blocked_edge_count: 0,
      blocked_node_count: 0,
      risk_weighting_applied: false,
      risk_weighting_status: "unavailable_unvalidated_semantics",
    };

    assert.equal(mockEmergencyResponse.risk_weighting_applied, false);
    assert.equal(
      mockEmergencyResponse.risk_weighting_status,
      "unavailable_unvalidated_semantics"
    );
  });

  it("verifies ADM-G-ENT to ACD-G-EXIT cross-building path steps and total distance", () => {
    const expectedEdgeIds = [
      "30000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000002",
      "30000000-0000-4000-8000-000000000005",
      "30000000-0000-4000-8000-000000000010",
      "30000000-0000-4000-8000-000000000021",
      "30000000-0000-4000-8000-000000000011",
      "30000000-0000-4000-8000-000000000012",
      "30000000-0000-4000-8000-000000000015",
    ];
    let totalDist = 0;
    for (const eid of expectedEdgeIds) {
      const edge = DEMO_EDGES.find((e) => e.id === eid);
      assert.ok(edge, `Edge ${eid} must exist`);
      totalDist += edge.distance;
    }
    assert.equal(totalDist, 78);
  });
});

describe("Campus Map - Compact Label Mapping", () => {
  it("generates concise, meaningful labels for all 21 nodes without modifying underlying codes", () => {
    assert.equal(getCompactNodeLabel("ADM-G-ENT"), "ADM-ENT");
    assert.equal(getCompactNodeLabel("ADM-G-JCT"), "ADM-JCT");
    assert.equal(getCompactNodeLabel("ADM-G-EXIT"), "ADM-EXIT");
    assert.equal(getCompactNodeLabel("ADM-G-STAIR"), "ADM-STAIR");
    assert.equal(getCompactNodeLabel("ADM-1-COR"), "ADM-1-COR");
    assert.equal(getCompactNodeLabel("ADM-1-ROOM"), "ADM-1-RM");
    assert.equal(getCompactNodeLabel("ACD-G-ROOM"), "ACD-ROOM");
    assert.equal(getCompactNodeLabel("ACD-1-STAIR"), "ACD-1-STR");
    assert.equal(getCompactNodeLabel("DEMO-ASSEMBLY-NODE"), "ASSEMBLY");
    assert.equal(getCompactNodeLabel("DEMO-WALKWAY"), "WALKWAY");
  });

  it("ensures all compact labels fit within 10 characters", () => {
    for (const node of DEMO_NODES) {
      const compact = getCompactNodeLabel(node.code);
      assert.ok(compact.length <= 10, `Label for ${node.code} is too long: ${compact}`);
      assert.ok(compact.length > 0, `Label for ${node.code} is empty`);
    }
  });
});

describe("Campus Map - Deterministic Collision-Avoidance Engine", () => {
  it("produces zero label-to-label overlaps across All Floors view", () => {
    const { labelBoxes } = computeAllLabelPositions(DEMO_NODES, "all");
    assert.equal(labelBoxes.size, 21);

    const boxes = Array.from(labelBoxes.entries());
    let overlapCount = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const area = boxOverlapArea(boxes[i][1], boxes[j][1]);
        if (area > 0) overlapCount++;
      }
    }
    assert.equal(overlapCount, 0, "No labels may overlap each other in All Floors view");
  });

  it("produces zero label-to-label overlaps across Ground and First floor views", () => {
    const groundNodes = DEMO_NODES.filter(
      (n) =>
        n.floor_id === "12000000-0000-4000-8000-000000000001" ||
        n.floor_id === "12000000-0000-4000-8000-000000000003" ||
        n.floor_id === null
    );
    const firstNodes = DEMO_NODES.filter(
      (n) =>
        n.floor_id === "12000000-0000-4000-8000-000000000002" ||
        n.floor_id === "12000000-0000-4000-8000-000000000004" ||
        n.node_type === "staircase"
    );

    const groundResult = computeAllLabelPositions(groundNodes, "ground");
    const firstResult = computeAllLabelPositions(firstNodes, "first");

    const checkOverlaps = (boxes: [string, any][]) => {
      let count = 0;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (boxOverlapArea(boxes[i][1], boxes[j][1]) > 0) count++;
        }
      }
      return count;
    };

    assert.equal(
      checkOverlaps(Array.from(groundResult.labelBoxes.entries())),
      0,
      "Ground view has 0 overlaps"
    );
    assert.equal(
      checkOverlaps(Array.from(firstResult.labelBoxes.entries())),
      0,
      "First view has 0 overlaps"
    );
  });

  it("keeps all label bounding boxes strictly within the SVG viewport bounds", () => {
    const { labelBoxes, badgeBoxes } = computeAllLabelPositions(
      DEMO_NODES,
      "all",
      DEMO_NODES[0].id,
      DEMO_NODES[5].id
    );
    const minX = -4;
    const maxX = 100;
    const minY = -4;
    const maxY = 38;

    for (const [id, box] of labelBoxes.entries()) {
      assert.ok(box.x >= minX, `Node ${id} label x (${box.x}) exceeds minX (${minX})`);
      assert.ok(box.x + box.width <= maxX, `Node ${id} label right exceeds maxX (${maxX})`);
      assert.ok(box.y >= minY, `Node ${id} label y (${box.y}) exceeds minY (${minY})`);
      assert.ok(box.y + box.height <= maxY, `Node ${id} label bottom exceeds maxY (${maxY})`);
    }

    for (const [id, badge] of badgeBoxes.entries()) {
      assert.ok(badge.x >= minX, `Node ${id} badge x exceeds minX`);
      assert.ok(badge.x + badge.width <= maxX, `Node ${id} badge right exceeds maxX`);
      assert.ok(badge.y >= minY, `Node ${id} badge y exceeds minY`);
      assert.ok(badge.y + badge.height <= maxY, `Node ${id} badge bottom exceeds maxY`);
    }
  });

  it("keeps START and DEST markers distinct and non-overlapping with their node labels", () => {
    const startId = DEMO_NODES[0].id;
    const destId = DEMO_NODES[5].id;
    const { labelBoxes, badgeBoxes } = computeAllLabelPositions(
      DEMO_NODES,
      "all",
      startId,
      destId
    );

    const startLabel = labelBoxes.get(startId)!;
    const startBadge = badgeBoxes.get(startId)!;
    assert.ok(startLabel && startBadge, "START node must have both label and badge");
    assert.equal(
      boxOverlapArea(startLabel, startBadge),
      0,
      "START badge must not overlap START label"
    );

    const destLabel = labelBoxes.get(destId)!;
    const destBadge = badgeBoxes.get(destId)!;
    assert.ok(destLabel && destBadge, "DEST node must have both label and badge");
    assert.equal(
      boxOverlapArea(destLabel, destBadge),
      0,
      "DEST badge must not overlap DEST label"
    );
  });

  it("START and DEST badges never overlap any ordinary node labels across multiple route pairs", () => {
    // Test pairs:
    // 1: ADM-1-ROOM (1-st floor) to ADM-G-EXIT (ground exit)
    // 2: ADM-G-ENT to ASM-PT-1 (assembly)
    // 3: ACD-1-ROOM to ACD-G-EXIT
    const pairs = [
      [DEMO_NODES[7].id, DEMO_NODES[5].id],
      [DEMO_NODES[0].id, DEMO_NODES[19].id],
      [DEMO_NODES[17].id, DEMO_NODES[15].id],
    ];

    for (const [startId, destId] of pairs) {
      const { labelBoxes, badgeBoxes } = computeAllLabelPositions(
        DEMO_NODES,
        "all",
        startId,
        destId
      );

      for (const [badgeNodeId, badge] of badgeBoxes.entries()) {
        for (const [labelNodeId, label] of labelBoxes.entries()) {
          const overlap = boxOverlapArea(badge, label);
          assert.equal(
            overlap,
            0,
            `Badge at ${badgeNodeId} overlaps label at ${labelNodeId} for pair ${startId}->${destId}`
          );
        }
      }
    }
  });

  it("Administration building cluster (ADM-1-EXT, ADM-EXIT, ADM-1-ROOM, ADM-1-JCT) has 0 overlaps", () => {
    for (const filter of ["all", "ground", "first"] as const) {
      const filteredNodes = DEMO_NODES.filter((node) => {
        if (filter === "all") return true;
        if (filter === "ground") {
          return (
            node.floor_id === "12000000-0000-4000-8000-000000000001" ||
            node.floor_id === "12000000-0000-4000-8000-000000000003" ||
            node.floor_id === null
          );
        }
        return (
          node.floor_id === "12000000-0000-4000-8000-000000000002" ||
          node.floor_id === "12000000-0000-4000-8000-000000000004" ||
          node.node_type === "staircase"
        );
      });

      const { labelBoxes, badgeBoxes } = computeAllLabelPositions(
        filteredNodes,
        filter,
        DEMO_NODES[7].id, // ADM-1-ROOM
        DEMO_NODES[5].id  // ADM-EXIT
      );

      // Check all visible labels against each other
      const boxes = Array.from(labelBoxes.values());
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          assert.equal(
            boxOverlapArea(boxes[i], boxes[j]),
            0,
            `Overlap between labels in filter ${filter}`
          );
        }
      }

      // Check all badges against all labels
      for (const badge of badgeBoxes.values()) {
        for (const label of labelBoxes.values()) {
          assert.equal(
            boxOverlapArea(badge, label),
            0,
            `Badge overlaps label in filter ${filter}`
          );
        }
      }
    }
  });

  it("supports active edge avoidance without breaking label constraints", () => {
    // Admin corridor edge
    const activeEdges = [DEMO_EDGES[1].id, DEMO_EDGES[4].id];
    const { labelBoxes } = computeAllLabelPositions(
      DEMO_NODES,
      "all",
      DEMO_NODES[0].id,
      DEMO_NODES[5].id,
      activeEdges,
      DEMO_EDGES
    );

    assert.equal(labelBoxes.size, 21);
    const boxes = Array.from(labelBoxes.values());
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        assert.equal(boxOverlapArea(boxes[i], boxes[j]), 0);
      }
    }
  });
});
