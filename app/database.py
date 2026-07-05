"""Async Supabase database client via httpx — replaces sync supabase-py.

Wraps the Supabase REST API (PostgREST) and Storage API with async httpx
calls so we never block the event loop.

Usage:
    from app.database import supabase

    # Query
    result = await supabase.table("shops").select("*").execute()
    shop = result.data[0]

    # Single
    shop = await supabase.table("shops").select("*").eq("id", "uuid").single().execute()

    # Insert
    await supabase.table("products").insert({...}).execute()

    # Update
    await supabase.table("orders").update({"status": "ACCEPTED"}).eq("order_code", "SK1234").execute()

    # Upsert
    await supabase.table("products").upsert(payload, on_conflict="shop_id,name").execute()

    # Storage
    url = await supabase.storage.upload("media", "path/to/file.jpg", image_bytes)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

import httpx

from app.config import settings
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


# ── Result wrapper ───────────────────────────────────────────────────────


@dataclass
class SupabaseResult:
    """Unified result object matching supabase-py's .execute() return shape."""

    data: list[dict[str, Any]] | dict[str, Any] | None = None
    count: int | None = None


# ── Query builder ────────────────────────────────────────────────────────


class TableQuery:
    """Builds and executes PostgREST queries asynchronously."""

    def __init__(self, rest: PostgRESTClient, table: str) -> None:
        self._rest = rest
        self._table = table
        self._select_query: str = "*"
        self._filters: list[str] = []
        self._order_clauses: list[str] = []
        self._limit_val: int | None = None
        self._offset_val: int | None = None
        self._single_mode: bool = False
        self._maybe_single_mode: bool = False
        self._insert_data: dict[str, Any] | list[dict[str, Any]] | None = None
        self._update_data: dict[str, Any] | None = None
        self._upsert_data: dict[str, Any] | list[dict[str, Any]] | None = None
        self._upsert_conflict: str | None = None
        self._method: str = "GET"

    # ── Query modifiers ──────────────────────────────────────────────────

    def select(self, query: str = "*") -> TableQuery:
        self._select_query = query
        self._method = "GET"
        return self

    def insert(self, data: dict[str, Any] | list[dict[str, Any]]) -> TableQuery:
        self._insert_data = data
        self._method = "POST"
        return self

    def update(self, data: dict[str, Any]) -> TableQuery:
        self._update_data = data
        self._method = "PATCH"
        return self

    def upsert(
        self, data: dict[str, Any] | list[dict[str, Any]], on_conflict: str = ""
    ) -> TableQuery:
        self._upsert_data = data
        self._upsert_conflict = on_conflict
        self._method = "UPSERT"
        return self

    def delete(self) -> TableQuery:
        self._method = "DELETE"
        return self

    def eq(self, column: str, value: Any) -> TableQuery:
        self._filters.append(f"{column}=eq.{self._encode(value)}")
        return self

    def in_(self, column: str, values: list[Any]) -> TableQuery:
        encoded = ",".join(self._encode(v) for v in values)
        self._filters.append(f"{column}=in.({encoded})")
        return self

    def neq(self, column: str, value: Any) -> TableQuery:
        self._filters.append(f"{column}=neq.{self._encode(value)}")
        return self

    def gte(self, column: str, value: Any) -> TableQuery:
        self._filters.append(f"{column}=gte.{self._encode(value)}")
        return self

    def lt(self, column: str, value: Any) -> TableQuery:
        self._filters.append(f"{column}=lt.{self._encode(value)}")
        return self

    def order(self, column: str, desc: bool = False, nullsfirst: bool = False) -> TableQuery:
        nulls = "first" if nullsfirst else "last"
        direction = "desc" if desc else "asc"
        self._order_clauses.append(f"{column}.{direction}.nulls{nulls}")
        return self

    def limit(self, n: int) -> TableQuery:
        self._limit_val = n
        return self

    def offset(self, n: int) -> TableQuery:
        self._offset_val = n
        return self

    def single(self) -> TableQuery:
        self._single_mode = True
        return self

    def maybe_single(self) -> TableQuery:
        self._maybe_single_mode = True
        return self

    # ── Execution ────────────────────────────────────────────────────────

    async def execute(self) -> SupabaseResult:
        if self._method == "GET":
            return await self._execute_get()
        elif self._method == "POST":
            return await self._execute_post()
        elif self._method == "PATCH":
            return await self._execute_patch()
        elif self._method == "DELETE":
            return await self._execute_delete()
        elif self._method == "UPSERT":
            return await self._execute_upsert()
        raise RuntimeError(f"Unknown method: {self._method}")

    async def _execute_get(self) -> SupabaseResult:
        url = self._build_url()
        headers = self._rest.headers.copy()

        if self._single_mode or self._maybe_single_mode:
            headers["Accept"] = "application/vnd.pgrst.object+json"

        resp = await self._rest._client.get(url, headers=headers)

        if resp.status_code == 404 and self._maybe_single_mode:
            return SupabaseResult(data=None)

        if resp.status_code == 406 and self._maybe_single_mode:
            return SupabaseResult(data=None)

        resp.raise_for_status()

        if self._single_mode or self._maybe_single_mode:
            data = resp.json() if resp.content else None
            return SupabaseResult(data=data)

        raw = resp.json()
        if isinstance(raw, list):
            return SupabaseResult(data=raw)
        return SupabaseResult(data=[raw] if raw else [])

    async def _execute_post(self) -> SupabaseResult:
        url = f"{self._rest.base_url}/{self._table}"
        headers = self._rest.headers.copy()
        headers["Prefer"] = "return=representation"

        resp = await self._rest._client.post(url, headers=headers, json=self._insert_data)

        resp.raise_for_status()
        raw = resp.json()
        if isinstance(raw, list):
            return SupabaseResult(data=raw)
        return SupabaseResult(data=[raw])

    async def _execute_patch(self) -> SupabaseResult:
        url = self._build_url()
        headers = self._rest.headers.copy()
        headers["Prefer"] = "return=representation"

        resp = await self._rest._client.patch(url, headers=headers, json=self._update_data)

        resp.raise_for_status()
        raw = resp.json()
        if isinstance(raw, list):
            return SupabaseResult(data=raw)
        return SupabaseResult(data=[raw] if raw else [])

    async def _execute_upsert(self) -> SupabaseResult:
        url = f"{self._rest.base_url}/{self._table}"
        headers = self._rest.headers.copy()
        headers["Prefer"] = "return=representation"

        if self._upsert_conflict:
            headers["Prefer"] += f",resolution=merge-duplicates"
            url += f"?on_conflict={self._upsert_conflict}"

        resp = await self._rest._client.post(url, headers=headers, json=self._upsert_data)

        resp.raise_for_status()
        raw = resp.json()
        if isinstance(raw, list):
            return SupabaseResult(data=raw)
        return SupabaseResult(data=[raw])

    async def _execute_delete(self) -> SupabaseResult:
        url = self._build_url()
        headers = self._rest.headers.copy()

        resp = await self._rest._client.delete(url, headers=headers)

        if resp.status_code == 204:
            return SupabaseResult(data=None)
        resp.raise_for_status()
        return SupabaseResult(data=None)

    # ── Helpers ──────────────────────────────────────────────────────────

    def _build_url(self) -> str:
        base = f"{self._rest.base_url}/{self._table}"
        params: list[str] = [f"select={self._select_query}"]

        params.extend(self._filters)

        if self._order_clauses:
            params.append(f"order={','.join(self._order_clauses)}")

        if self._limit_val is not None:
            params.append(f"limit={self._limit_val}")

        if self._offset_val is not None:
            params.append(f"offset={self._offset_val}")

        return f"{base}?{'&'.join(params)}"

    @staticmethod
    def _encode(value: Any) -> str:
        if value is None:
            return "null"
        if isinstance(value, bool):
            return str(value).lower()
        return quote(str(value), safe="")


# ── Storage client ───────────────────────────────────────────────────────


class StorageClient:
    """Async Supabase Storage client."""

    def __init__(self, base_url: str, headers: dict[str, str]) -> None:
        self.base_url = f"{base_url}/storage/v1"
        self.headers = headers
        self._client = httpx.AsyncClient(timeout=60.0)

    async def upload(
        self,
        bucket: str,
        path: str,
        file_data: bytes,
        content_type: str = "image/jpeg",
        upsert: bool = True,
    ) -> str | None:
        """Upload a file to Supabase Storage and return the public URL.

        Args:
            bucket: Storage bucket name (e.g. "media").
            path: File path within bucket (e.g. "shops/{shop_id}/{filename}").
            file_data: Raw file bytes.
            content_type: MIME type.
            upsert: Overwrite if file exists.

        Returns:
            Public URL string on success, None on failure.
        """
        url = f"{self.base_url}/object/{bucket}/{path}"
        headers = {
            **self.headers,
            "Content-Type": content_type,
        }
        if upsert:
            headers["x-upsert"] = "true"

        resp = await self._client.post(url, headers=headers, content=file_data)

        if resp.status_code not in (200, 201):
            logger.error(
                "Storage upload failed",
                extra={"bucket": bucket, "path": path, "status": resp.status_code, "body": resp.text},
            )
            return None

        public_url = f"{self.base_url.rstrip('/v1')}/storage/v1/object/public/{bucket}/{path}"
        logger.info("File uploaded to storage", extra={"url": public_url})
        return public_url

    async def delete(self, bucket: str, path: str) -> bool:
        """Delete a file from Supabase Storage."""
        url = f"{self.base_url}/object/{bucket}/{path}"
        headers = self.headers.copy()

        resp = await self._client.delete(url, headers=headers)

        if resp.status_code not in (200, 204):
            logger.error(
                "Storage delete failed",
                extra={"bucket": bucket, "path": path, "status": resp.status_code},
            )
            return False
        return True

    def get_public_url(self, bucket: str, path: str) -> str:
        """Get the public URL for a file in storage."""
        base = settings.supabase_url.rstrip("/")
        return f"{base}/storage/v1/object/public/{bucket}/{path}"


# ── PostgREST client ─────────────────────────────────────────────────────


class PostgRESTClient:
    """Low-level async PostgREST client."""

    def __init__(self, base_url: str, headers: dict[str, str]) -> None:
        self.base_url = f"{base_url}/rest/v1"
        self.headers = headers
        self._client = httpx.AsyncClient(timeout=30.0)

    def table(self, name: str) -> TableQuery:
        return TableQuery(self, name)

    async def _close(self) -> None:
        await self._client.aclose()


# ── Supabase wrapper ─────────────────────────────────────────────────────


class AsyncSupabase:
    """Async Supabase client — REST API + Storage.

    Usage:
        result = await supabase.table("shops").select("*").execute()
        url = await supabase.storage.upload("media", "path", data)
    """

    def __init__(self, url: str, service_key: str) -> None:
        base_url = url.rstrip("/")
        self._headers: dict[str, str] = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }
        self._rest = PostgRESTClient(base_url, self._headers)
        self.storage = StorageClient(base_url, self._headers)

    def table(self, name: str) -> TableQuery:
        return self._rest.table(name)

    @property
    def headers(self) -> dict[str, str]:
        return self._headers.copy()


# ── Singleton ────────────────────────────────────────────────────────────


_supabase: AsyncSupabase | None = None


def get_supabase() -> AsyncSupabase:
    """Get or create the async Supabase singleton."""
    global _supabase
    if _supabase is None:
        if not settings.supabase_url or not settings.supabase_service_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment")
        logger.info(
            "Initializing async Supabase client",
            extra={"url": settings.supabase_url},
        )
        _supabase = AsyncSupabase(settings.supabase_url, settings.supabase_service_key)
    return _supabase


# Module-level alias — matches existing `from app.database import supabase` pattern.
# This is an async proxy that lazily initializes on first await.
class _SupabaseProxy:
    """Lazy async proxy that defers Supabase client creation until first use."""

    _client: AsyncSupabase | None = None

    def _ensure(self) -> AsyncSupabase:
        if self._client is None:
            self._client = get_supabase()
        return self._client

    def table(self, name: str) -> TableQuery:
        return self._ensure().table(name)

    @property
    def storage(self) -> StorageClient:
        return self._ensure().storage

    def __repr__(self) -> str:
        if self._client is None:
            return "<AsyncSupabaseProxy (uninitialized)>"
        return repr(self._client)


supabase: AsyncSupabase = _SupabaseProxy()  # type: ignore[assignment]
