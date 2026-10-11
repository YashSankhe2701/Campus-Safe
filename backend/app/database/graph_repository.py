"""PostgreSQL reads for static campus graph topology."""

from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.core.config import settings


class CampusNotFoundError(LookupError):
    """Raised when a requested campus does not exist."""


class PostgresGraphRepository:
    """Loads a campus and its static nodes/edges using short-lived connections."""

    def load_topology(
        self, campus_id: str
    ) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
        if not settings.SUPABASE_DB_URL:
            raise ConnectionError("PostgreSQL is not configured.")

        with psycopg.connect(
            settings.SUPABASE_DB_URL,
            connect_timeout=8,
            row_factory=dict_row,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id, name FROM public.campuses WHERE id = %s",
                    (campus_id,),
                )
                campus = cursor.fetchone()
                if campus is None:
                    raise CampusNotFoundError(campus_id)

                cursor.execute(
                    "SELECT id, floor_id, node_type, name, code, x_coordinate, "
                    "y_coordinate, latitude, longitude, capacity, is_exit, "
                    "is_assembly_point, metadata "
                    "FROM public.graph_nodes WHERE campus_id = %s ORDER BY id",
                    (campus_id,),
                )
                nodes = cursor.fetchall()

                cursor.execute(
                    "SELECT id, from_node_id, to_node_id, distance, base_capacity, "
                    "base_speed, bidirectional, edge_type, metadata "
                    "FROM public.graph_edges WHERE campus_id = %s ORDER BY id",
                    (campus_id,),
                )
                edges = cursor.fetchall()

        return dict(campus), [dict(row) for row in nodes], [dict(row) for row in edges]