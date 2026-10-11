"""Read campus exits from PostgreSQL."""

from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.core.config import settings


class ExitDataError(ValueError):
    """Raised when persisted exit data is inconsistent with campus topology."""


class PostgresExitRepository:
    """Loads persisted exits without assigning meaning to their capacities."""

    def load_exits(self, campus_id: str) -> list[dict[str, Any]]:
        if not settings.SUPABASE_DB_URL:
            raise ConnectionError("PostgreSQL is not configured.")

        with psycopg.connect(
            settings.SUPABASE_DB_URL,
            connect_timeout=8,
            row_factory=dict_row,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id, node_id, name, exit_type, is_active "
                    "FROM public.exits WHERE campus_id = %s ORDER BY id",
                    (campus_id,),
                )
                return [dict(row) for row in cursor.fetchall()]