"""Read campus emergency and condition records from PostgreSQL."""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from app.core.config import settings


class EmergencyConditionDataError(ValueError):
    """Raised when persisted emergency-condition records are inconsistent."""


@dataclass(frozen=True)
class EmergencyConditionSnapshot:
    """Applicable blockages and active emergency IDs for one campus read."""

    active_emergency_ids: tuple[str, ...]
    blocked_node_ids: tuple[str, ...]
    blocked_edge_ids: tuple[str, ...]


def _record_uuid(value: Any, field: str) -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise EmergencyConditionDataError(f"Invalid UUID in {field}.") from exc


def compile_emergency_conditions(
    campus_id: str,
    emergencies: list[dict[str, Any]],
    affected_nodes: list[dict[str, Any]],
    affected_edges: list[dict[str, Any]],
    node_conditions: list[dict[str, Any]],
    edge_conditions: list[dict[str, Any]],
    *,
    now: datetime | None = None,
) -> EmergencyConditionSnapshot:
    """Resolve active emergency scope and union all applicable blocked flags.

    Null-emergency condition rows represent campus-current conditions and remain
    applicable until replaced or cleared. The schema defines no staleness TTL.
    Risk values are intentionally not interpreted here.
    """
    campus = _record_uuid(campus_id, "campus_id")
    current_time = now or datetime.now(timezone.utc)
    active_ids: set[str] = set()

    for row in emergencies:
        row_campus_id = row.get("campus_id")
        if row_campus_id is not None and _record_uuid(
            row_campus_id, "emergencies.campus_id"
        ) != campus:
            raise EmergencyConditionDataError("Emergency record belongs to a different campus.")
        if row.get("status") not in {"active", "resolved", "cancelled"}:
            raise EmergencyConditionDataError("Emergency record has an invalid status.")
        emergency_id = _record_uuid(row.get("id"), "emergencies.id")
        started_at = row.get("started_at")
        ended_at = row.get("ended_at")
        if not isinstance(started_at, datetime):
            raise EmergencyConditionDataError("Emergency started_at is invalid.")
        if started_at.tzinfo is None or current_time.tzinfo is None:
            raise EmergencyConditionDataError("Emergency timestamps must include a timezone.")
        if (
            row["status"] == "active"
            and started_at <= current_time
            and ended_at is None
        ):
            active_ids.add(emergency_id)

    blocked_node_ids: set[str] = set()
    blocked_edge_ids: set[str] = set()

    for table_rows, entity_field, target in (
        (affected_nodes, "node_id", blocked_node_ids),
        (affected_edges, "edge_id", blocked_edge_ids),
    ):
        for row in table_rows:
            row_campus_id = row.get("campus_id")
            if row_campus_id is not None and _record_uuid(
                row_campus_id, "emergency_affected.campus_id"
            ) != campus:
                raise EmergencyConditionDataError("Affected record belongs to a different campus.")
            emergency_id = _record_uuid(
                row.get("emergency_id"), "emergency_affected.emergency_id"
            )
            if emergency_id in active_ids and row.get("blocked") is True:
                target.add(_record_uuid(row.get(entity_field), f"emergency_affected.{entity_field}"))

    for table_rows, entity_field, target in (
        (node_conditions, "node_id", blocked_node_ids),
        (edge_conditions, "edge_id", blocked_edge_ids),
    ):
        for row in table_rows:
            row_campus_id = row.get("campus_id")
            if row_campus_id is not None and _record_uuid(
                row_campus_id, "conditions.campus_id"
            ) != campus:
                raise EmergencyConditionDataError("Condition belongs to a different campus.")
            emergency_id_value = row.get("emergency_id")
            applies = emergency_id_value is None
            if emergency_id_value is not None:
                applies = _record_uuid(
                    emergency_id_value, "conditions.emergency_id"
                ) in active_ids
            if applies and row.get("blocked") is True:
                target.add(_record_uuid(row.get(entity_field), f"conditions.{entity_field}"))

    return EmergencyConditionSnapshot(
        active_emergency_ids=tuple(sorted(active_ids)),
        blocked_node_ids=tuple(sorted(blocked_node_ids)),
        blocked_edge_ids=tuple(sorted(blocked_edge_ids)),
    )


class PostgresEmergencyConditionRepository:
    """Loads all condition-source rows in one read-only, repeatable-read snapshot."""

    def load_conditions(self, campus_id: str) -> EmergencyConditionSnapshot:
        if not settings.SUPABASE_DB_URL:
            raise ConnectionError("PostgreSQL is not configured.")

        with psycopg.connect(
            settings.SUPABASE_DB_URL,
            connect_timeout=8,
            row_factory=dict_row,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                cursor.execute(
                    "SELECT id, campus_id, status, started_at, ended_at "
                    "FROM public.emergencies WHERE campus_id = %s ORDER BY id",
                    (campus_id,),
                )
                emergencies = cursor.fetchall()
                cursor.execute(
                    "SELECT campus_id, emergency_id, node_id, blocked "
                    "FROM public.emergency_affected_nodes WHERE campus_id = %s",
                    (campus_id,),
                )
                affected_nodes = cursor.fetchall()
                cursor.execute(
                    "SELECT campus_id, emergency_id, edge_id, blocked "
                    "FROM public.emergency_affected_edges WHERE campus_id = %s",
                    (campus_id,),
                )
                affected_edges = cursor.fetchall()
                cursor.execute(
                    "SELECT campus_id, emergency_id, node_id, blocked, updated_at "
                    "FROM public.node_conditions WHERE campus_id = %s",
                    (campus_id,),
                )
                node_conditions = cursor.fetchall()
                cursor.execute(
                    "SELECT campus_id, emergency_id, edge_id, blocked, updated_at "
                    "FROM public.edge_conditions WHERE campus_id = %s",
                    (campus_id,),
                )
                edge_conditions = cursor.fetchall()

        return compile_emergency_conditions(
            campus_id,
            [dict(row) for row in emergencies],
            [dict(row) for row in affected_nodes],
            [dict(row) for row in affected_edges],
            [dict(row) for row in node_conditions],
            [dict(row) for row in edge_conditions],
        )