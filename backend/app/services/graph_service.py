"""Load and validate campus topology as an in-memory NetworkX graph."""

import asyncio
import math
from typing import Any, Protocol
from uuid import UUID

import networkx as nx

from app.database.graph_repository import (
    CampusNotFoundError,
    PostgresGraphRepository,
)


class GraphDataError(ValueError):
    """Raised when persisted campus topology cannot form a valid graph."""


class GraphRepository(Protocol):
    def load_topology(
        self, campus_id: str
    ) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]: ...


def _normalized_id(value: Any, field_name: str) -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise GraphDataError(f"Invalid UUID in {field_name}.") from exc


def _positive_finite_number(value: Any, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise GraphDataError(f"{field_name} must be a positive finite number.")
    if not math.isfinite(value) or value <= 0:
        raise GraphDataError(f"{field_name} must be a positive finite number.")
    return float(value)


def _positive_capacity(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise GraphDataError("Edge base_capacity must be a positive integer.")
    return value


def build_campus_graph(
    campus_id: str,
    campus: dict[str, Any],
    node_rows: list[dict[str, Any]],
    edge_rows: list[dict[str, Any]],
) -> nx.MultiDiGraph:
    """Build a directed multigraph, expanding bidirectional edges into two arcs."""
    normalized_campus_id = _normalized_id(campus_id, "campus_id")
    graph = nx.MultiDiGraph(
        campus_id=normalized_campus_id,
        campus_name=campus.get("name"),
    )

    for row in node_rows:
        node_id = _normalized_id(row.get("id"), "graph_nodes.id")
        if node_id in graph:
            raise GraphDataError("Duplicate graph node ID.")
        row_campus_id = row.get("campus_id")
        if row_campus_id is not None and _normalized_id(
            row_campus_id, "graph_nodes.campus_id"
        ) != normalized_campus_id:
            raise GraphDataError("Graph node belongs to a different campus.")
        capacity = row.get("capacity")
        if capacity is not None and (
            isinstance(capacity, bool) or not isinstance(capacity, int) or capacity < 0
        ):
            raise GraphDataError("Graph node capacity must be a non-negative integer or null.")
        graph.add_node(
            node_id,
            **{
                key: value
                for key, value in row.items()
                if key not in {"id", "campus_id"}
            },
            id=node_id,
        )

    edge_ids: set[str] = set()
    for row in edge_rows:
        edge_id = _normalized_id(row.get("id"), "graph_edges.id")
        if edge_id in edge_ids:
            raise GraphDataError("Duplicate graph edge ID.")
        edge_ids.add(edge_id)
        row_campus_id = row.get("campus_id")
        if row_campus_id is not None and _normalized_id(
            row_campus_id, "graph_edges.campus_id"
        ) != normalized_campus_id:
            raise GraphDataError("Graph edge belongs to a different campus.")

        from_node_id = _normalized_id(row.get("from_node_id"), "graph_edges.from_node_id")
        to_node_id = _normalized_id(row.get("to_node_id"), "graph_edges.to_node_id")
        if from_node_id not in graph or to_node_id not in graph:
            raise GraphDataError("Graph edge references a node that is not loaded.")
        if from_node_id == to_node_id:
            raise GraphDataError("Graph self-loops are not allowed.")

        distance = _positive_finite_number(row.get("distance"), "Edge distance")
        base_speed = _positive_finite_number(row.get("base_speed"), "Edge base_speed")
        base_capacity = _positive_capacity(row.get("base_capacity"))
        bidirectional = row.get("bidirectional")
        if not isinstance(bidirectional, bool):
            raise GraphDataError("Edge bidirectional must be a boolean.")

        attributes = {
            key: value
            for key, value in row.items()
            if key not in {"from_node_id", "to_node_id", "campus_id"}
        }
        attributes.update(
            id=edge_id,
            from_node_id=from_node_id,
            to_node_id=to_node_id,
            distance=distance,
            base_capacity=base_capacity,
            base_speed=base_speed,
            bidirectional=bidirectional,
            traversal_direction="forward",
        )
        graph.add_edge(from_node_id, to_node_id, key=edge_id, **attributes)

        if bidirectional:
            reverse_attributes = {
                **attributes,
                "traversal_direction": "reverse",
            }
            graph.add_edge(to_node_id, from_node_id, key=edge_id, **reverse_attributes)

    graph.graph["stored_edge_count"] = len(edge_rows)
    graph.graph["directed_edge_count"] = sum(
        not row.get("bidirectional", False) for row in edge_rows
    )
    graph.graph["bidirectional_edge_count"] = sum(
        row.get("bidirectional", False) for row in edge_rows
    )
    graph.graph["arc_count"] = graph.number_of_edges()
    return graph


async def load_campus_graph(
    campus_id: str,
    repository: GraphRepository | None = None,
) -> nx.MultiDiGraph:
    """Load one campus graph per invocation; no graph is retained between calls."""
    active_repository = repository or PostgresGraphRepository()
    campus, node_rows, edge_rows = await asyncio.to_thread(
        active_repository.load_topology,
        _normalized_id(campus_id, "campus_id"),
    )
    return build_campus_graph(campus_id, campus, node_rows, edge_rows)


def summarize_campus_graph(graph: nx.MultiDiGraph) -> dict[str, Any]:
    """Return public, non-sensitive graph counts without serializing the graph."""
    node_type_counts: dict[str, int] = {}
    for _, attributes in graph.nodes(data=True):
        node_type = attributes.get("node_type", "unknown")
        node_type_counts[node_type] = node_type_counts.get(node_type, 0) + 1

    return {
        "campus_id": graph.graph["campus_id"],
        "campus_name": graph.graph.get("campus_name"),
        "graph_type": type(graph).__name__,
        "node_count": graph.number_of_nodes(),
        "edge_count": graph.graph["stored_edge_count"],
        "arc_count": graph.number_of_edges(),
        "exit_count": sum(bool(data.get("is_exit")) for _, data in graph.nodes(data=True)),
        "assembly_point_count": sum(
            bool(data.get("is_assembly_point")) for _, data in graph.nodes(data=True)
        ),
        "node_type_counts": node_type_counts,
        "directed_edge_count": graph.graph["directed_edge_count"],
        "bidirectional_edge_count": graph.graph["bidirectional_edge_count"],
    }


__all__ = [
    "CampusNotFoundError",
    "GraphDataError",
    "build_campus_graph",
    "load_campus_graph",
    "summarize_campus_graph",
]