"""Auth API routes — Supabase session exchange.

Endpoints:
  POST /auth/supabase-session — Exchange a Supabase JWT for shop data + API key
"""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request

from app.config import settings
from app.database import supabase

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/supabase-session")
async def exchange_supabase_session(request: Request) -> dict[str, Any]:
    """Exchange a Supabase JWT for shop data + API key.

    Accepts Authorization: Bearer <supabase-access-token>
    Verifies token via Supabase Auth REST API.
    Looks up shop by the verified email.
    Returns shop data + api_key (or null if no shop exists for this email).
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Bearer token")

    token = auth.removeprefix("Bearer ")

    # Verify token via Supabase Auth REST API (same endpoint Supabase JS SDK uses)
    # apikey header required for Supabase Auth REST gateway to route correctly
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_anon_key,
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired Supabase session")

    user_data: dict[str, Any] = resp.json()
    email: str = user_data.get("email", "")
    if not email:
        raise HTTPException(status_code=400, detail="No email found in Supabase session")

    # Look up shop by email
    result = (
        await supabase.table("shops")
        .select("*")
        .eq("owner_email", email)
        .maybe_single()
        .execute()
    )

    if not result.data:
        # Registered in Supabase Auth but no shop yet → onboarding
        return {"shop": None, "api_key": None, "email": email}

    shop: dict[str, Any] = result.data
    # Return only safe fields — never expose api_key or access_token to frontend
    safe_fields = {
        "id": shop.get("id"),
        "name": shop.get("name"),
        "owner_name": shop.get("owner_name"),
        "owner_email": shop.get("owner_email"),
        "owner_user_id": shop.get("owner_user_id"),
        "owner_whatsapp_number": shop.get("owner_whatsapp_number"),
        "city": shop.get("city"),
        "default_language": shop.get("default_language"),
        "business_type": shop.get("business_type"),
        "category": shop.get("category"),
        "active": shop.get("active"),
        "created_at": shop.get("created_at"),
        "updated_at": shop.get("updated_at"),
    }
    return {
        "shop": safe_fields,
        "has_api_key": bool(shop.get("api_key")),
        "email": email,
    }
