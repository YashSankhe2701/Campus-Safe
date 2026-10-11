"""
Base repository pattern.

Provides an abstract interface so the rest of the backend
does not depend on Supabase-specific implementation details.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class BaseRepository(ABC):
    """
    Abstract base repository.

    All data-access classes should extend this.
    Concrete implementations handle the Supabase-specific logic,
    keeping the service layer database-agnostic.
    """

    @abstractmethod
    async def get_by_id(self, table: str, record_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a single record by its ID."""
        ...

    @abstractmethod
    async def get_all(
        self, table: str, *, limit: int = 100, offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Retrieve multiple records with pagination."""
        ...

    @abstractmethod
    async def create(self, table: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Insert a new record."""
        ...

    @abstractmethod
    async def update(
        self, table: str, record_id: str, data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update an existing record."""
        ...

    @abstractmethod
    async def delete(self, table: str, record_id: str) -> bool:
        """Delete a record."""
        ...
