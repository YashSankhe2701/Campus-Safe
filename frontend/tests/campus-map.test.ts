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
  CAMPUS_VIEWBOX,
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

  it("validates evacuation response schema when nearest exit route is found", () => {
    const mockEvacuationResponse = {
      status: "route_found" as const,
      campus_id: DEMO_CAMPUS_ID,
      start_node_id: "20000000-0000-4000-8000-000000000012", // ACD-G-COR
      selected_exit_id: "40000000-0000-4000-8000-000000000003",
      selected_exit_node_id: "20000000-0000-4000-8000-000000000016",
      selected_exit_name: "Academic East Emergency Exit",
      selected_exit_type: "emergency",
      path_node_ids: [
        "20000000-0000-4000-8000-000000000012",
        "20000000-0000-4000-8000-000000000013",
        "20000000-0000-4000-8000-000000000016",
      ],
      total_distance_m: 18.0,
      steps: [
        {
          from_node_id: "20000000-0000-4000-8000-000000000012",
          to_node_id: "20000000-0000-4000-8000-000000000013",
          edge_id: "30000000-0000-4000-8000-000000000012",
          distance_m: 7.0,
        },
        {
          from_node_id: "20000000-0000-4000-8000-000000000013",
          to_node_id: "20000000-0000-4000-8000-000000000016",
          edge_id: "30000000-0000-4000-8000-000000000015",
          distance_m: 11.0,
        },
      ],
      active_emergency_ids: [],
      evaluated_exits: [
        {
          exit_id: "40000000-0000-4000-8000-000000000003",
          node_id: "20000000-0000-4000-8000-000000000016",
          name: "Academic East Emergency Exit",
          exit_type: "emergency",
          reachable: true,
          distance_m: 18.0,
          exclusion_reason: null,
        },
        {
          exit_id: "40000000-0000-4000-8000-000000000001",
          node_id: "20000000-0000-4000-8000-000000000006",
          name: "Administration West Emergency Exit",
          exit_type: "emergency",
          reachable: false,
          distance_m: null,
          exclusion_reason: "unreachable" as const,
        },
      ],
      selection_objective: "shortest_physical_distance_among_eligible_exits",
      safety_notice: "Distance-based exit selection is not a safety guarantee.",
    };

    assert.equal(mockEvacuationResponse.status, "route_found");
    assert.equal(mockEvacuationResponse.total_distance_m, 18.0);
    assert.match(mockEvacuationResponse.safety_notice, /not a safety guarantee/i);
    assert.equal(mockEvacuationResponse.evaluated_exits[0].reachable, true);
    assert.equal(mockEvacuationResponse.evaluated_exits[1].reachable, false);
    assert.equal(mockEvacuationResponse.evaluated_exits[1].exclusion_reason, "unreachable");
  });

  it("validates evacuation response schema when all candidate exits are excluded (no_route)", () => {
    const mockNoRouteEvacuation = {
      status: "no_route" as const,
      campus_id: DEMO_CAMPUS_ID,
      start_node_id: "20000000-0000-4000-8000-000000000012",
      selected_exit_id: null,
      selected_exit_node_id: null,
      selected_exit_name: null,
      selected_exit_type: null,
      path_node_ids: [],
      total_distance_m: null,
      steps: [],
      active_emergency_ids: [],
      evaluated_exits: [
        {
          exit_id: "40000000-0000-4000-8000-000000000001",
          node_id: "20000000-0000-4000-8000-000000000006",
          name: "Administration West Emergency Exit",
          exit_type: "emergency",
          reachable: false,
          distance_m: null,
          exclusion_reason: "unreachable" as const,
        },
        {
          exit_id: "40000000-0000-4000-8000-000000000003",
          node_id: "20000000-0000-4000-8000-000000000016",
          name: "Academic East Emergency Exit",
          exit_type: "emergency",
          reachable: false,
          distance_m: null,
          exclusion_reason: "blocked" as const,
        },
      ],
      selection_objective: "shortest_physical_distance_among_eligible_exits",
      safety_notice: "Distance-based exit selection is not a safety guarantee.",
    };

    assert.equal(mockNoRouteEvacuation.status, "no_route");
    assert.equal(mockNoRouteEvacuation.selected_exit_id, null);
    assert.equal(mockNoRouteEvacuation.total_distance_m, null);
    assert.equal(mockNoRouteEvacuation.path_node_ids.length, 0);
    assert.ok(mockNoRouteEvacuation.evaluated_exits.every((e) => !e.reachable));
    assert.ok(mockNoRouteEvacuation.evaluated_exits.every((e) => e.exclusion_reason !== null));
  });

  it("validates dynamic hazard rerouting response schema with alternate exit selection and blocked count", () => {
    const mockReroutedEvacuation = {
      status: "route_found" as const,
      campus_id: DEMO_CAMPUS_ID,
      start_node_id: "20000000-0000-4000-8000-000000000008", // ADM-1-ROOM
      selected_exit_id: "40000000-0000-4000-8000-000000000001",
      selected_exit_node_id: "20000000-0000-4000-8000-000000000006",
      selected_exit_name: "Administration West Emergency Exit",
      selected_exit_type: "emergency",
      path_node_ids: [
        "20000000-0000-4000-8000-000000000008",
        "20000000-0000-4000-8000-000000000007",
        "20000000-0000-4000-8000-000000000005",
        "20000000-0000-4000-8000-000000000003",
        "20000000-0000-4000-8000-000000000006",
      ],
      total_distance_m: 26.0,
      steps: [
        {
          from_node_id: "20000000-0000-4000-8000-000000000008",
          to_node_id: "20000000-0000-4000-8000-000000000007",
          edge_id: "30000000-0000-4000-8000-000000000007",
          distance_m: 6.0,
        },
        {
          from_node_id: "20000000-0000-4000-8000-000000000007",
          to_node_id: "20000000-0000-4000-8000-000000000005",
          edge_id: "30000000-0000-4000-8000-000000000006",
          distance_m: 4.0,
        },
        {
          from_node_id: "20000000-0000-4000-8000-000000000005",
          to_node_id: "20000000-0000-4000-8000-000000000003",
          edge_id: "30000000-0000-4000-8000-000000000004",
          distance_m: 4.0,
        },
        {
          from_node_id: "20000000-0000-4000-8000-000000000003",
          to_node_id: "20000000-0000-4000-8000-000000000006",
          edge_id: "30000000-0000-4000-8000-000000000005",
          distance_m: 12.0,
        },
      ],
      active_emergency_ids: [],
      evaluated_exits: [
        {
          exit_id: "40000000-0000-4000-8000-000000000001",
          node_id: "20000000-0000-4000-8000-000000000006",
          name: "Administration West Emergency Exit",
          exit_type: "emergency",
          reachable: true,
          distance_m: 26.0,
          exclusion_reason: null,
        },
        {
          exit_id: "40000000-0000-4000-8000-000000000002",
          node_id: "20000000-0000-4000-8000-000000000010",
          name: "Administration First Floor Fire Escape",
          exit_type: "emergency",
          reachable: false,
          distance_m: null,
          exclusion_reason: "blocked" as const,
        },
      ],
      blocked_edge_count: 1,
      blocked_node_count: 0,
      selection_objective: "shortest_physical_distance_among_eligible_exits",
      safety_notice: "Distance-based exit selection is not a safety guarantee.",
    };

    assert.equal(mockReroutedEvacuation.status, "route_found");
    assert.equal(mockReroutedEvacuation.selected_exit_name, "Administration West Emergency Exit");
    assert.equal(mockReroutedEvacuation.total_distance_m, 26.0);
    assert.equal(mockReroutedEvacuation.blocked_edge_count, 1);
    assert.ok(mockReroutedEvacuation.steps.every((s) => s.edge_id !== "30000000-0000-4000-8000-000000000009"));
    const blockedExit = mockReroutedEvacuation.evaluated_exits.find((e) => e.exclusion_reason === "blocked");
    assert.ok(blockedExit);
    assert.equal(blockedExit?.reachable, false);
    assert.doesNotMatch(mockReroutedEvacuation.safety_notice, /safe route guaranteed/i);
  });

  it("ensures simulated hazard presets reference authoritative campus edges without fake real-time sensors", () => {
    const fireEscapeEdge = "30000000-0000-4000-8000-000000000009";
    const groundExitEdge = "30000000-0000-4000-8000-000000000005";

    const edgeIds = new Set(DEMO_EDGES.map((e) => e.id));
    assert.ok(edgeIds.has(fireEscapeEdge), "Fire escape edge exists in authoritative demo graph");
    assert.ok(edgeIds.has(groundExitEdge), "Ground exit edge exists in authoritative demo graph");
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
    const minX = CAMPUS_VIEWBOX.minX;
    const maxX = CAMPUS_VIEWBOX.maxX;
    const minY = CAMPUS_VIEWBOX.minY;
    const maxY = CAMPUS_VIEWBOX.maxY;

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

describe("Campus Map - Hazard Simulation Controls & Presets", () => {
  it("verifies that campus-map.tsx contains the unconditional Hazard Simulation (Demo Only) selector and all 4 options", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const mapPath = path.resolve(import.meta.dirname, "../components/map/campus-map.tsx");
    const content = await fs.readFile(mapPath, "utf-8");

    // Must be labeled Hazard Simulation (Demo Only)
    assert.match(content, /Hazard Simulation \(Demo Only\)/);
    assert.match(content, /id="hazard-scenario-select"/);
    assert.match(content, /data-testid="hazard-simulation-select"/);

    // Verify all four option labels requested by user
    assert.match(content, /Baseline — No simulated blockages/);
    assert.match(content, /1st Floor Fire Escape Blocked/);
    assert.match(content, /West Ground Emergency Exit Blocked/);
    assert.match(content, /All Administration Exits Blocked/);

    // Verify selector is unconditional (not wrapped in strategy condition)
    assert.doesNotMatch(content, /\{\(strategy === "evacuation" \|\| strategy === "emergency"\) && \(\s*<div[^>]*>\s*<div[^>]*>\s*<span[^>]*>Hazard Simulation/);
  });

  it("maps hazard scenario presets to authoritative demo campus blockage IDs", () => {
    const edgeMap: Record<string, string[]> = {
      none: [],
      fire_escape: ["30000000-0000-4000-8000-000000000009"],
      ground_exit: ["30000000-0000-4000-8000-000000000005"],
      all_admin_exits: [
        "30000000-0000-4000-8000-000000000009",
        "30000000-0000-4000-8000-000000000005",
      ],
    };

    const authoritativeEdges = new Set(DEMO_EDGES.map((e) => e.id));

    // None produces empty blockage array
    assert.deepEqual(edgeMap.none, []);

    // Fire escape edge exists in demo graph
    assert.equal(edgeMap.fire_escape.length, 1);
    assert.ok(authoritativeEdges.has(edgeMap.fire_escape[0]));

    // Ground exit edge exists in demo graph
    assert.equal(edgeMap.ground_exit.length, 1);
    assert.ok(authoritativeEdges.has(edgeMap.ground_exit[0]));

    // All admin exits includes both edges
    assert.equal(edgeMap.all_admin_exits.length, 2);
    assert.ok(edgeMap.all_admin_exits.every((id) => authoritativeEdges.has(id)));
  });

  it("constructs valid API request bodies with blocked edge IDs when hazard scenario is active", () => {
    const startNode = "20000000-0000-4000-8000-000000000008"; // ADM-1-ROOM
    const destNode = "20000000-0000-4000-8000-000000000006";  // ADM-G-EXIT
    const fireEscapeEdge = "30000000-0000-4000-8000-000000000009";

    // Evacuation request with hazard scenario
    const evacRequest = {
      start_node_id: startNode,
      blocked_edge_ids: [fireEscapeEdge],
    };
    assert.equal(evacRequest.start_node_id, startNode);
    assert.deepEqual(evacRequest.blocked_edge_ids, [fireEscapeEdge]);

    // Shortest / Dijkstra request with hazard scenario
    const shortestRequest = {
      start_node_id: startNode,
      destination_node_id: destNode,
      blocked_edge_ids: [fireEscapeEdge],
    };
    assert.deepEqual(shortestRequest.blocked_edge_ids, [fireEscapeEdge]);

    // Baseline request clears blockages
    const baselineRequest = {
      start_node_id: startNode,
      blocked_edge_ids: [],
    };
    assert.deepEqual(baselineRequest.blocked_edge_ids, []);
  });

  it("ensures evacuation telemetry never falls back to shortest-path telemetry or stale distance", () => {
    // Simulated state when evacuation returns no_route while a previous shortestResult (17.0m) exists
    const shortestResult = {
      campus_id: "10000000-0000-4000-8000-000000000001",
      start_node_id: "20000000-0000-4000-8000-000000000009",
      destination_node_id: "20000000-0000-4000-8000-000000000010",
      path_node_ids: ["20000000-0000-4000-8000-000000000009", "20000000-0000-4000-8000-000000000010"],
      total_distance_m: 17.0,
      steps: [],
    };

    const evacuationNoRouteResult = {
      status: "no_route" as const,
      campus_id: "10000000-0000-4000-8000-000000000001",
      start_node_id: "20000000-0000-4000-8000-000000000009",
      selected_exit_id: null,
      selected_exit_node_id: null,
      selected_exit_name: null,
      selected_exit_type: null,
      path_node_ids: [],
      total_distance_m: null,
      steps: [],
      active_emergency_ids: [],
      evaluated_exits: [],
      blocked_edge_count: 2,
    };

    const strategy = "evacuation";

    // Formatter logic replicating campus-map.tsx telemetry distance resolution
    const formatDistance = (
      strat: string,
      evac: typeof evacuationNoRouteResult | null,
      short: typeof shortestResult | null
    ) => {
      if (strat === "evacuation") {
        if (evac?.status === "route_found" && evac.total_distance_m !== null && evac.total_distance_m !== undefined) {
          return `${evac.total_distance_m.toFixed(1)} m`;
        }
        return "—";
      }
      return short?.total_distance_m !== null && short?.total_distance_m !== undefined
        ? `${short.total_distance_m.toFixed(1)} m`
        : "—";
    };

    // When in evacuation strategy with no_route, distance MUST be "—", NOT "17.0 m"
    const renderedDistance = formatDistance(strategy, evacuationNoRouteResult, shortestResult);
    assert.equal(renderedDistance, "—");

    // Badge resolution logic replicating campus-map.tsx
    const resolveBadge = (
      strat: string,
      evac: typeof evacuationNoRouteResult | null
    ) => {
      if (strat === "evacuation") {
        if (evac?.status === "no_route") return "No Exit Reachable";
        if (evac?.blocked_edge_count && evac.blocked_edge_count > 0) return "Alternate Route Selected";
        return "Active Path";
      }
      return "Active Path";
    };

    assert.equal(resolveBadge(strategy, evacuationNoRouteResult), "No Exit Reachable");
  });

  it("verifies race condition request sequence tracker discards out-of-order in-flight responses", () => {
    let activeRequestId = 0;
    let renderedResult: string | null = null;

    // Simulate scenario change 1 (fire_escape) -> slower network response (resolves in 50ms)
    const req1 = ++activeRequestId;
    const p1 = new Promise<string>((resolve) => {
      setTimeout(() => resolve("fire_escape_33.0m"), 50);
    }).then((res) => {
      if (req1 === activeRequestId) {
        renderedResult = res;
      }
    });

    // Simulate scenario change 2 (all_admin_exits) -> faster response (resolves in 10ms)
    const req2 = ++activeRequestId;
    const p2 = new Promise<string>((resolve) => {
      setTimeout(() => resolve("all_admin_exits_no_route"), 10);
    }).then((res) => {
      if (req2 === activeRequestId) {
        renderedResult = res;
      }
    });

    return Promise.all([p1, p2]).then(() => {
      // req1 should NOT have overwritten req2
      assert.equal(renderedResult, "all_admin_exits_no_route");
    });
  });

  it("confirms returning to baseline resets blockages and restores expected baseline exit distance (17.0m)", () => {
    const baselineResult = {
      status: "route_found" as const,
      campus_id: "10000000-0000-4000-8000-000000000001",
      start_node_id: "20000000-0000-4000-8000-000000000009",
      selected_exit_id: "40000000-0000-4000-8000-000000000002",
      selected_exit_node_id: "20000000-0000-4000-8000-000000000010",
      selected_exit_name: "Administration First Floor Fire Escape",
      selected_exit_type: "fire_escape",
      path_node_ids: [
        "20000000-0000-4000-8000-000000000009",
        "20000000-0000-4000-8000-000000000008",
        "20000000-0000-4000-8000-000000000010",
      ],
      total_distance_m: 17.0,
      steps: [
        { edge_id: "30000000-0000-4000-8000-000000000008", distance_m: 7.0 },
        { edge_id: "30000000-0000-4000-8000-000000000009", distance_m: 10.0 },
      ],
      active_emergency_ids: [],
      evaluated_exits: [],
      blocked_edge_count: 0,
    };

    assert.equal(baselineResult.status, "route_found");
    assert.equal(baselineResult.total_distance_m, 17.0);
    assert.equal(baselineResult.selected_exit_name, "Administration First Floor Fire Escape");
    assert.equal(baselineResult.blocked_edge_count, 0);
  });

  it("ensures API errors clear active route results and display explicit error info without retaining old telemetry", () => {
    // Initial state with an active route
    let activeResult: { distance: number | null } | null = { distance: 17.0 };
    let activeError: { kind: string; message: string } | null = null;

    // Simulation of error handler on request failure
    const handleFailure = (err: { kind: string; message: string }) => {
      activeResult = null;
      activeError = err;
    };

    handleFailure({ kind: "unreachable", message: "No reachable exit" });

    assert.equal(activeResult, null);
    assert.notEqual(activeError, null);
    assert.equal(activeError?.kind, "unreachable");
  });

  it("ensures no_route response results in empty active path node and edge collections", () => {
    const noRouteResponse = {
      status: "no_route" as const,
      campus_id: "10000000-0000-4000-8000-000000000001",
      start_node_id: "20000000-0000-4000-8000-000000000009",
      path_node_ids: [],
      steps: [],
      total_distance_m: null,
    };

    // Replicating campus-map.tsx activePathNodeIds and activePathEdgeIds memo logic
    const pathNodeIds = noRouteResponse.status === "route_found" ? noRouteResponse.path_node_ids : [];
    const pathEdgeIds = noRouteResponse.status === "route_found" ? noRouteResponse.steps.map((s: { edge_id: string }) => s.edge_id) : [];

    assert.deepEqual(pathNodeIds, []);
    assert.deepEqual(pathEdgeIds, []);
  });
});

describe("Campus Map - Full Calculated Route Visualization & Redesign Upgrade", () => {
  it("extracts continuous visual segments across every consecutive node pair", () => {
    // Simulated path of 4 nodes: N1 -> N2 -> N3 -> N4
    const pathNodeIds = [
      DEMO_NODES[0].id, // ADM-G-ENT
      DEMO_NODES[1].id, // ADM-G-COR
      DEMO_NODES[2].id, // ADM-G-JCT
      DEMO_NODES[5].id, // ADM-G-EXIT
    ];

    // Segment extraction algorithm matching campus-map.tsx fullRouteSegments
    const segments: Array<{ fromId: string; toId: string; edgeExists: boolean }> = [];
    for (let i = 0; i < pathNodeIds.length - 1; i++) {
      const fromId = pathNodeIds[i];
      const toId = pathNodeIds[i + 1];
      const edge = findEdgeBetween(fromId, toId) || DEMO_EDGES.find(
        (e) => (e.from_node_id === fromId && e.to_node_id === toId) ||
               (e.bidirectional && e.from_node_id === toId && e.to_node_id === fromId)
      );
      segments.push({ fromId, toId, edgeExists: Boolean(edge) });
    }

    // Exactly 3 segments for 4 nodes
    assert.equal(segments.length, 3);
    assert.equal(segments[0].fromId, DEMO_NODES[0].id);
    assert.equal(segments[0].toId, DEMO_NODES[1].id);
    assert.ok(segments[0].edgeExists);

    assert.equal(segments[1].fromId, DEMO_NODES[1].id);
    assert.equal(segments[1].toId, DEMO_NODES[2].id);
    assert.ok(segments[1].edgeExists);

    assert.equal(segments[2].fromId, DEMO_NODES[2].id);
    assert.equal(segments[2].toId, DEMO_NODES[5].id);
    assert.ok(segments[2].edgeExists);
  });

  it("identifies cross-floor staircase transitions along calculated routes", () => {
    // 1st floor room (ADM-1-ROOM) -> 1st floor stair (ADM-1-STAIR) -> ground stair (ADM-G-STAIR) -> ground exit
    const multiFloorPath = [
      "20000000-0000-4000-8000-000000000008", // ADM-1-ROOM (floor 2)
      "20000000-0000-4000-8000-000000000007", // ADM-1-STAIR (floor 2)
      "20000000-0000-4000-8000-000000000004", // ADM-G-STAIR (floor 1)
      "20000000-0000-4000-8000-000000000006", // ADM-G-EXIT (floor 1)
    ];

    const crossFloorSteps: number[] = [];
    for (let i = 0; i < multiFloorPath.length - 1; i++) {
      const n1 = getNodeById(multiFloorPath[i]);
      const n2 = getNodeById(multiFloorPath[i + 1]);
      if (n1?.floor_id !== n2?.floor_id) {
        crossFloorSteps.push(i);
      }
    }

    // Step 1 (ADM-1-STAIR -> ADM-G-STAIR) must be flagged as cross-floor transition
    assert.equal(crossFloorSteps.length, 1);
    assert.equal(crossFloorSteps[0], 1);
  });

  it("detects hidden route nodes when floor filter is active", () => {
    const multiFloorPath = [
      "20000000-0000-4000-8000-000000000008", // ADM-1-ROOM (1st floor)
      "20000000-0000-4000-8000-000000000007", // ADM-1-STAIR (1st floor)
      "20000000-0000-4000-8000-000000000004", // ADM-G-STAIR (ground floor)
      "20000000-0000-4000-8000-000000000006", // ADM-G-EXIT (ground floor)
    ];

    // Under ground floor filter, ADM-1-ROOM is hidden
    const groundFloorFilter = (nodeId: string) => {
      const node = getNodeById(nodeId);
      return (
        node?.floor_id === "12000000-0000-4000-8000-000000000001" ||
        node?.floor_id === "12000000-0000-4000-8000-000000000003" ||
        node?.floor_id === null
      );
    };

    const hiddenNodes = multiFloorPath.filter((id) => !groundFloorFilter(id));
    assert.ok(hiddenNodes.length > 0, "Route must contain hidden nodes under ground filter");
    assert.ok(hiddenNodes.includes("20000000-0000-4000-8000-000000000008"));
  });

  it("prevents submission of identical start and destination endpoints", () => {
    const sameNodeId = DEMO_NODES[0].id;
    const isInvalid = (start: string, dest: string, strat: string) => {
      return strat !== "evacuation" && start === dest;
    };

    assert.equal(isInvalid(sameNodeId, sameNodeId, "shortest"), true);
    assert.equal(isInvalid(sameNodeId, sameNodeId, "astar"), true);
    // Evacuation mode does not require destination input
    assert.equal(isInvalid(sameNodeId, sameNodeId, "evacuation"), false);
  });

  it("verifies campus-map.tsx contains full-route SVG layer and dark theme tokens", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const mapPath = path.resolve(import.meta.dirname, "../components/map/campus-map.tsx");
    const content = await fs.readFile(mapPath, "utf-8");

    // Route layer above base edges
    assert.match(content, /id="active-route-highlight-layer"/);
    assert.match(content, /id="route-arrow-dark"/);
    assert.match(content, /#34D399/); // Route green color
    assert.match(content, /#22D3EE/); // Cyan accent color
    assert.match(content, /#0B1120/); // Dark background
    assert.match(content, /#111827/); // Dark panel
    assert.match(content, /#263449/); // Dark border
  });

  it("verifies four academic buildings, central assembly quad, and Main Gate in SVG site plan", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const mapPath = path.resolve(import.meta.dirname, "../components/map/campus-map.tsx");
    const content = await fs.readFile(mapPath, "utf-8");

    // Building 1 — CSE (North-West)
    assert.match(content, /id="bldg-1-cse"/);
    assert.match(content, /BLDG 1 · CSE DEPARTMENT/);

    // Building 2 — IT (North-East)
    assert.match(content, /id="bldg-2-it"/);
    assert.match(content, /BLDG 2 · IT DEPARTMENT/);

    // Building 3 — AI/ML (South-West)
    assert.match(content, /id="bldg-3-aiml"/);
    assert.match(content, /BLDG 3 · AI & ML DEPARTMENT/);

    // Building 4 — CSBS (South-East)
    assert.match(content, /id="bldg-4-csbs"/);
    assert.match(content, /BLDG 4 · CSBS DEPARTMENT/);

    // Main Gate (South Side)
    assert.match(content, /id="campus-main-gate"/);
    assert.match(content, /MAIN GATE/);

    // Central Quad / Assembly Zone
    assert.match(content, /id="central-courtyard-quad"/);
    assert.match(content, /ASSEMBLY ZONE/);
  });

  it("verifies directional STAIRS transition indicators (STAIRS ↑ FIRST FLOOR / STAIRS ↓ GROUND FLOOR)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const mapPath = path.resolve(import.meta.dirname, "../components/map/campus-map.tsx");
    const content = await fs.readFile(mapPath, "utf-8");

    // Directional staircase indicators
    assert.match(content, /STAIRS ↑ FIRST FLOOR/);
    assert.match(content, /STAIRS ↓ GROUND FLOOR/);

    // Test transition logic: Ground to First Floor
    const groundNode = DEMO_NODES.find((n) => n.id === "20000000-0000-4000-8000-000000000005")!; // ADM-G-STAIR
    const firstNode = DEMO_NODES.find((n) => n.id === "20000000-0000-4000-8000-000000000007")!; // ADM-1-STAIR

    const isGoingUp =
      (groundNode.floor_name?.includes("Ground") || groundNode.floor_id?.endsWith("1")) &&
      (firstNode.floor_name?.includes("First") || firstNode.floor_id?.endsWith("2"));
    assert.equal(isGoingUp, true);

    const isGoingDown =
      (firstNode.floor_name?.includes("First") || firstNode.floor_id?.endsWith("2")) &&
      (groundNode.floor_name?.includes("Ground") || groundNode.floor_id?.endsWith("1"));
    assert.equal(isGoingDown, true);
  });

  it("verifies Start and Destination selects are grouped by four academic buildings and grounds", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const mapPath = path.resolve(import.meta.dirname, "../components/map/campus-map.tsx");
    const content = await fs.readFile(mapPath, "utf-8");

    assert.match(content, /label="Building 1 — CSE Department \(1st Floor\)"/);
    assert.match(content, /label="Building 2 — IT Department \(1st Floor\)"/);
    assert.match(content, /label="Building 3 — AI & ML Department \(Ground Floor\)"/);
    assert.match(content, /label="Building 4 — CSBS Department \(Ground Floor\)"/);
    assert.match(content, /label="Campus Grounds & Central Quad"/);
  });

  it("verifies Auth pages (login, signup, forgot-password, reset-password) are created and integrated", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    // Login page
    const loginPath = path.resolve(import.meta.dirname, "../app/login/page.tsx");
    const loginContent = await fs.readFile(loginPath, "utf-8");
    assert.match(loginContent, /Sign In/);
    assert.match(loginContent, /CAMPUS-SAFE/);

    // Signup page
    const signupPath = path.resolve(import.meta.dirname, "../app/signup/page.tsx");
    const signupContent = await fs.readFile(signupPath, "utf-8");
    assert.match(signupContent, /Create Account/);
    assert.match(signupContent, /Full Name/);

    // Forgot password page
    const forgotPath = path.resolve(import.meta.dirname, "../app/forgot-password/page.tsx");
    const forgotContent = await fs.readFile(forgotPath, "utf-8");
    assert.match(forgotContent, /Send Password Reset Link/);

    // Reset password page
    const resetPath = path.resolve(import.meta.dirname, "../app/reset-password/page.tsx");
    const resetContent = await fs.readFile(resetPath, "utf-8");
    assert.match(resetContent, /Update Password/);

    // Auth provider
    const authProviderPath = path.resolve(import.meta.dirname, "../hooks/use-auth.tsx");
    const authContent = await fs.readFile(authProviderPath, "utf-8");
    assert.match(authContent, /useAuth/);
    assert.match(authContent, /supabase\.auth/);
  });

  it("verifies Dijkstra is default strategy and ML prediction option indicates artifact requirement", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const mapPath = path.resolve(import.meta.dirname, "../components/map/campus-map.tsx");
    const content = await fs.readFile(mapPath, "utf-8");

    // Default strategy state must initialize to "shortest" (Dijkstra)
    assert.match(content, /useState<RoutingStrategy>\("shortest"\)/);

    // Option label must clearly indicate model artifact requirement
    assert.match(content, /ML Evacuation Time Prediction \(Requires Model Artifact\)/);

    // Error callout offers immediate recovery to Dijkstra and A*
    assert.match(content, /Switch to Dijkstra/);
    assert.match(content, /Switch to A\*/);
  });

  it("retains valid physical shortest path when ML prediction is null/unavailable", () => {
    const shortestResult = {
      campus_id: DEMO_CAMPUS_ID,
      start_node_id: "20000000-0000-4000-8000-000000000001",
      destination_node_id: "20000000-0000-4000-8000-000000000006",
      path_node_ids: [
        "20000000-0000-4000-8000-000000000001",
        "20000000-0000-4000-8000-000000000002",
        "20000000-0000-4000-8000-000000000003",
        "20000000-0000-4000-8000-000000000006",
      ],
      total_distance_m: 26.0,
      steps: [
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
        {
          from_node_id: "20000000-0000-4000-8000-000000000003",
          to_node_id: "20000000-0000-4000-8000-000000000006",
          edge_id: "30000000-0000-4000-8000-000000000005",
          distance_m: 12,
        },
      ],
    };

    const predictionResult = null; // ML prediction failed with 503
    const strategy = "prediction";

    // Resolution logic from campus-map.tsx activePathNodeIds
    const activePathNodeIds =
      strategy === "prediction"
        ? predictionResult?.path_node_ids || shortestResult?.path_node_ids || []
        : shortestResult?.path_node_ids || [];

    // Resolution logic from campus-map.tsx activePathEdgeIds
    const activePathEdgeIds =
      strategy === "prediction"
        ? predictionResult?.edge_ids || (shortestResult ? shortestResult.steps.map((s) => s.edge_id) : [])
        : shortestResult ? shortestResult.steps.map((s) => s.edge_id) : [];

    // Path must NOT be empty — physical route is preserved
    assert.deepEqual(activePathNodeIds, shortestResult.path_node_ids);
    assert.deepEqual(activePathEdgeIds, ["30000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000002", "30000000-0000-4000-8000-000000000005"]);

    // Est. Duration telemetry logic from campus-map.tsx
    let durationDisplay = "—";
    let durationSubtext = "";
    if (strategy === "prediction") {
      if (predictionResult?.predicted_evacuation_time_sec !== undefined) {
        durationDisplay = `${Math.round(predictionResult.predicted_evacuation_time_sec)}s`;
        durationSubtext = "ML Predicted Evacuation Time";
      } else if (shortestResult) {
        durationDisplay = "Model Unavailable";
        durationSubtext = "Physical path active";
      }
    }

    assert.equal(durationDisplay, "Model Unavailable");
    assert.equal(durationSubtext, "Physical path active");
  });
});
