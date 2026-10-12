"""Meilisearch client with SQL fallback for candidate search."""

from __future__ import annotations

from typing import Any, Optional

from app.config import get_settings

settings = get_settings()
_client = None


def get_meili():
    global _client
    if _client is not None:
        return _client
    if not settings.meili_url:
        return None
    try:
        import meilisearch
        _client = meilisearch.Client(settings.meili_url, settings.meili_master_key or None)
        return _client
    except Exception:
        return None


def ensure_indexes() -> None:
    client = get_meili()
    if not client:
        return
    try:
        client.create_index("profiles", {"primaryKey": "id"})
        client.create_index("jobs", {"primaryKey": "id"})
    except Exception:
        pass


def index_profile(doc: dict[str, Any]) -> None:
    client = get_meili()
    if not client:
        return
    try:
        client.index("profiles").add_documents([doc])
    except Exception:
        pass


def search_profiles(q: str, filters: Optional[str] = None, limit: int = 20) -> Optional[list]:
    client = get_meili()
    if not client:
        return None
    try:
        opts: dict[str, Any] = {"limit": limit}
        if filters:
            opts["filter"] = filters
        res = client.index("profiles").search(q or "", opts)
        return res.get("hits") or []
    except Exception:
        return None
