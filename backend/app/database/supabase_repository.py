"""
Supabase-specific repository implementation.

All Supabase-specific logic is confined here.
The rest of the application talks to BaseRepository.
"""

import logging
from typing import Any, Dict, List, Optional

from app.database.connection import _get_supabase_client
from app.database.repository import BaseRepository

logger = logging.getLogger("campus_safe")


class SupabaseRepository(BaseRepository):
    """Concrete repository backed by Supabase PostgreSQL."""

    def _get_client(self):
        client = _get_supabase_client()
        if client is None:
            raise ConnectionError(
                "Supabase client is not available. "
                "Check your SUPABASE_URL and key configuration."
            )
        return client

    async def get_by_id(self, table: str, record_id: str) -> Optional[Dict[str, Any]]:
        client = self._get_client()
        response = client.table(table).select("*").eq("id", record_id).execute()
        data = response.data
        return data[0] if data else None

    async def get_all(
        self, table: str, *, limit: int = 100, offset: int = 0
    ) -> List[Dict[str, Any]]:
        client = self._get_client()
        response = (
            client.table(table)
            .select("*")
            .range(offset, offset + limit - 1)
            .execute()
        )
        return response.data or []

    async def create(self, table: str, data: Dict[str, Any]) -> Dict[str, Any]:
        client = self._get_client()
        response = client.table(table).insert(data).execute()
        return response.data[0] if response.data else {}

    async def update(
        self, table: str, record_id: str, data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        client = self._get_client()
        response = client.table(table).update(data).eq("id", record_id).execute()
        return response.data[0] if response.data else None

    async def delete(self, table: str, record_id: str) -> bool:
        client = self._get_client()
        response = client.table(table).delete().eq("id", record_id).execute()
        return bool(response.data)
