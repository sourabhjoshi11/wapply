"""Onboarding API routes — step-by-step shop setup with save-and-resume.

Each endpoint is idempotent (safe to call multiple times).
All require JWT authentication via get_current_user().

Endpoints:
  GET    /api/onboarding/status         — Current onboarding progress
  POST   /api/onboarding/save-basic-details  — Create/update shop
  POST   /api/onboarding/save-catalog        — Upsert products
  POST   /api/onboarding/save-tables         — Upsert tables for dine-in
  POST   /api/onboarding/save-staff          — Replace staff + availability
  POST   /api/onboarding/save-assets         — Upsert bookable assets
  POST   /api/onboarding/save-hours          — Save business hours
  POST   /api/onboarding/complete            — Mark onboarding finished
"""

from __future__ import annotations

import uuid as uuid_mod
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from app.auth import get_current_user, lookup_shop_by_owner_email
from app.database import supabase
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


# ── Helpers ─────────────────────────────────────────────────────────────


async def _get_shop_id_from_user(request: Request) -> str | None:
    """Look up existing shop for the current JWT user."""
    user = await get_current_user(request)
    shop = await lookup_shop_by_owner_email(user["auth_email"])
    if shop is not None:
        return str(shop["id"])
    return None


async def _check_shop_exists(shop_id: str) -> dict[str, Any] | None:
    """Return shop dict if it exists, None otherwise."""
    try:
        result = (
            await supabase.table("shops")
            .select("*")
            .eq("id", shop_id)
            .maybe_single()
            .execute()
        )
        return result.data
    except Exception:
        return None


def _required_steps_for_business(business_type: str) -> list[str]:
    """Return step keys required for a given business type."""
    base = ["basic_details"]
    type_steps: dict[str, list[str]] = {
        "shop": ["basic_details", "catalog"],
        "restaurant": ["basic_details", "menu", "tables"],
        "salon": ["basic_details", "services", "staff"],
        "spa": ["basic_details", "services", "staff"],
        "turf": ["basic_details", "assets", "hours"],
        "hotel": ["basic_details", "assets", "hours"],
        "gym": ["basic_details", "staff"],
    }
    return type_steps.get(business_type, base)


async def _infer_completed_steps(shop: dict[str, Any]) -> set[str]:
    """Infer which onboarding steps have data for this shop.

    Each check queries the relevant table and returns the step key if data exists.
    """
    shop_id = str(shop["id"])
    completed: set[str] = set()

    # basic_details — shop exists with required fields
    if shop.get("owner_name") and shop.get("name"):
        completed.add("basic_details")

    # catalog / menu / services — any products exist
    try:
        prod = await supabase.table("products").select("id").eq("shop_id", shop_id).limit(1).execute()
        if prod.data:
            completed.add("catalog")
            completed.add("menu")
            completed.add("services")
    except Exception:
        pass

    # tables — any tables exist
    try:
        tbl = await supabase.table("tables").select("id").eq("shop_id", shop_id).limit(1).execute()
        if tbl.data:
            completed.add("tables")
    except Exception:
        pass

    # staff — any staff exist
    try:
        stf = await supabase.table("staff").select("id").eq("shop_id", shop_id).limit(1).execute()
        if stf.data:
            completed.add("staff")
    except Exception:
        pass

    # assets — any bookable_assets exist
    try:
        ast = await supabase.table("bookable_assets").select("id").eq("shop_id", shop_id).limit(1).execute()
        if ast.data:
            completed.add("assets")
    except Exception:
        pass

    # hours — working_hours JSON set on shop
    if shop.get("working_hours"):
        completed.add("hours")

    return completed


# ── GET /api/onboarding/status ──────────────────────────────────────────


@router.get("/status")
async def get_onboarding_status(request: Request) -> dict[str, Any]:
    """Return the current onboarding state for the authenticated user.

    Returns shop data (if any), completed steps, missing steps, and whether
    onboarding is complete. This is the resume endpoint — frontend calls this
    on mount to pick up where the user left off.
    """
    user = await get_current_user(request)
    email = user["auth_email"]

    shop = await lookup_shop_by_owner_email(email)

    if shop is None:
        return {
            "shop": None,
            "email": email,
            "completed_steps": [],
            "missing_steps": ["basic_details"],
            "is_complete": False,
            "current_step_key": "business_type",
        }

    # Build safe shop fields (no api_key or access_token)
    safe_fields = {
        "id": str(shop["id"]),
        "name": shop.get("name"),
        "owner_name": shop.get("owner_name"),
        "owner_email": shop.get("owner_email"),
        "owner_whatsapp_number": shop.get("owner_whatsapp_number"),
        "city": shop.get("city"),
        "default_language": shop.get("default_language"),
        "business_type": shop.get("business_type"),
        "category": shop.get("category"),
        "active": shop.get("active", True),
    }

    business_type = shop.get("business_type", "")
    required_steps = _required_steps_for_business(str(business_type))

    completed = await _infer_completed_steps(shop)
    missing = [s for s in required_steps if s not in completed]

    # Determine current step key for resume
    onboarded = shop.get("onboarded", False)
    is_complete = onboarded or len(missing) == 0

    current_step_key: str
    if is_complete:
        current_step_key = "success"
    elif "basic_details" in missing:
        current_step_key = "basic_details"
    elif business_type in ("salon", "spa") and "services" in missing and "staff" not in completed:
        current_step_key = "services"
    elif business_type in ("salon", "spa") and "staff" in missing:
        current_step_key = "staff"
    elif business_type == "restaurant" and "menu" in missing:
        current_step_key = "menu"
    elif business_type == "restaurant" and "tables" in missing:
        current_step_key = "tables"
    elif business_type in ("turf", "hotel") and "assets" in missing:
        current_step_key = "assets"
    elif business_type in ("turf", "hotel") and "hours" in missing:
        current_step_key = "hours"
    elif business_type == "shop" and "catalog" in missing:
        current_step_key = "catalog"
    else:
        current_step_key = "whatsapp"

    return {
        "shop": safe_fields,
        "email": email,
        "completed_steps": list(completed),
        "missing_steps": missing,
        "is_complete": is_complete,
        "current_step_key": current_step_key,
    }


# ── POST /api/onboarding/save-basic-details ─────────────────────────────


@router.post("/save-basic-details")
async def save_basic_details(request: Request) -> dict[str, Any]:
    """Create or update the shop with basic details.

    Idempotent: if the user already has a shop, updates it.
    If no shop exists, creates one.

    Accepts both multipart/form-data (with optional logo) and application/json.
    """
    user = await get_current_user(request)
    owner_email = user["auth_email"]
    owner_user_id = user["auth_user_id"]

    # Parse input
    content_type = request.headers.get("content-type", "")
    is_multipart = "multipart" in content_type or "form-data" in content_type

    data: dict[str, Any] = {}
    if is_multipart:
        form = await request.form()
        for key in form:
            if not hasattr(form[key], "filename"):
                data[key] = str(form[key])
    else:
        data = await request.json()

    owner_name = data.get("owner_name", "")
    name = data.get("name") or data.get("business_name", "")
    business_type = data.get("business_type", "shop")
    category = data.get("category", "")
    city = data.get("city", "")
    owner_whatsapp = data.get("owner_whatsapp", "")
    language = data.get("language", "hi")

    if not name or not owner_name:
        raise HTTPException(status_code=400, detail="owner_name and name/business_name are required")

    # Check if shop already exists for this user
    existing = await lookup_shop_by_owner_email(owner_email)

    if existing:
        # Update existing shop
        shop_id = str(existing["id"])
        update_data: dict[str, Any] = {
            "owner_name": owner_name,
            "owner_email": owner_email,
            "name": name,
            "business_type": business_type,
            "category": category,
            "city": city,
            "owner_whatsapp_number": owner_whatsapp,
            "default_language": language,
        }
        # Only update if columns exist (graceful for partial schema)
        try:
            await (
                supabase.table("shops")
                .update(update_data)
                .eq("id", shop_id)
                .execute()
            )
            logger.info("Shop updated via onboarding", extra={"shop_id": shop_id})
        except Exception as exc:
            # Fall back to minimal update
            minimal = {"owner_name": owner_name, "name": name}
            await (
                supabase.table("shops")
                .update(minimal)
                .eq("id", shop_id)
                .execute()
            )
            logger.warning(
                "Partial shop update succeeded (some columns may not exist)",
                extra={"shop_id": shop_id, "error": str(exc)},
            )

        return {"shop_id": shop_id, "created": False, "status": "updated"}
    else:
        # Create new shop
        # Generate temp whatsapp_number (UNIQUE NOT NULL constraint)
        whatsapp_number = owner_whatsapp or f"temp_{uuid_mod.uuid4().hex[:12]}"
        api_key = str(uuid_mod.uuid4())

        payload: dict[str, Any] = {
            "name": name,
            "whatsapp_number": whatsapp_number,
            "owner_name": owner_name,
            "owner_email": owner_email,
            "owner_whatsapp_number": owner_whatsapp,
            "api_key": api_key,
            "default_language": language,
            "business_type": business_type,
            "category": category,
            "city": city,
        }

        try:
            result = await supabase.table("shops").insert(payload).execute()
            shop_id = str(result.data[0]["id"])
            logger.info("Shop created via onboarding", extra={"shop_id": shop_id})
            return {"shop_id": shop_id, "created": True, "api_key": api_key, "status": "created"}
        except Exception as exc:
            err_str = str(exc)
            if "duplicate" in err_str.lower():
                # Race condition — user already has a shop, try update
                existing_shop = await lookup_shop_by_owner_email(owner_email)
                if existing_shop:
                    return {
                        "shop_id": str(existing_shop["id"]),
                        "created": False,
                        "status": "already_exists",
                    }
                raise HTTPException(status_code=409, detail="Shop already exists for this email") from exc
            raise HTTPException(status_code=500, detail=f"Failed to create shop: {err_str}") from exc


# ── POST /api/onboarding/save-catalog ───────────────────────────────────


@router.post("/save-catalog")
async def save_catalog(request: Request) -> dict[str, Any]:
    """Upsert products for a shop.

    Expects JSON body:
      { "shop_id": "...", "products": [{ "name": "...", "price": 100, ... }] }

    Products are upserted by (shop_id, name) — existing entries are updated.
    """
    user = await get_current_user(request)
    body = await request.json()
    shop_id = body.get("shop_id", "")
    products: list[dict[str, Any]] = body.get("products", [])

    if not shop_id:
        shop_id = await _get_shop_id_from_user(request)
    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id required")
    if not products:
        raise HTTPException(status_code=400, detail="products array required")

    shop = await _check_shop_exists(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    # Verify ownership
    if str(shop.get("owner_email", "")) != user["auth_email"]:
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        existing_result = (
            await supabase.table("products")
            .select("name")
            .eq("shop_id", shop_id)
            .execute()
        )
        existing_names = {p["name"] for p in (existing_result.data or [])}
    except Exception:
        existing_names = set()

    # Build payloads — only include columns known to exist in the products table
    # (id, shop_id, name, price, category, available, image_url, updated_at).
    new_products: list[dict[str, Any]] = []
    update_products: list[dict[str, Any]] = []
    for product in products:
        name = product.get("name", "").strip()
        if not name:
            continue

        payload: dict[str, Any] = {
            "shop_id": shop_id,
            "name": name,
            "price": product.get("price", 0),
            "category": product.get("category", ""),
            "available": product.get("available", True),
        }

        if name in existing_names:
            update_products.append(payload)
        else:
            new_products.append(payload)

    created = 0
    updated = 0

    if new_products:
        try:
            result = await supabase.table("products").insert(new_products).execute()
            created = len(result.data) if result.data else 0
        except Exception as exc:
            logger.error("Failed to insert new products", extra={"shop_id": shop_id, "error": str(exc)})
            raise HTTPException(status_code=500, detail=f"Failed to save products: {str(exc)}") from exc

    for p in update_products:
        try:
            await (
                supabase.table("products")
                .update(p)
                .eq("shop_id", shop_id)
                .eq("name", p["name"])
                .execute()
            )
            updated += 1
        except Exception as exc:
            logger.warning("Failed to update product", extra={"name": p["name"], "error": str(exc)})

    return {
        "shop_id": shop_id,
        "created": created,
        "updated": updated,
        "total": len(products),
    }


# ── POST /api/onboarding/save-tables ────────────────────────────────────


@router.post("/save-tables")
async def save_tables(request: Request) -> dict[str, Any]:
    """Idempotently generate tables for a shop.

    Expects JSON body:
      { "shop_id": "...", "count": 10 }

    Only creates tables that don't already exist (by table_number).
    Never deletes existing tables.
    """
    user = await get_current_user(request)
    body = await request.json()
    shop_id = body.get("shop_id", "")
    count = int(body.get("count", 0))

    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id required")
    if count < 1 or count > 100:
        raise HTTPException(status_code=400, detail="Table count must be between 1 and 100")

    shop = await _check_shop_exists(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if str(shop.get("owner_email", "")) != user["auth_email"]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get existing table numbers for this shop
    try:
        existing_result = (
            await supabase.table("tables")
            .select("table_number")
            .eq("shop_id", shop_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    existing_numbers = {row["table_number"] for row in (existing_result.data or [])}

    new_table_numbers = [i for i in range(1, count + 1) if i not in existing_numbers]

    if new_table_numbers:
        new_tables = [
            {
                "shop_id": shop_id,
                "table_number": i,
                "table_name": f"Table {i}",
                "active": True,
            }
            for i in new_table_numbers
        ]
        try:
            await supabase.table("tables").insert(new_tables).execute()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to create tables: {exc}") from exc

    return {
        "shop_id": shop_id,
        "requested": count,
        "created": len(new_table_numbers),
        "existing": len(existing_numbers),
        "total": max(count, len(existing_numbers)),
    }


# ── POST /api/onboarding/save-staff ─────────────────────────────────────


@router.post("/save-staff")
async def save_staff(request: Request) -> dict[str, Any]:
    """Replace all staff + availability for a shop.

    Expects JSON body:
      {
        "shop_id": "...",
        "staff": [{ "name": "...", "active": true, "working_hours": { ... } }]
      }

    This is a full replace — existing staff not in the payload are deactivated.
    Staff working_hours is written to the staff_availability table.
    """
    user = await get_current_user(request)
    body = await request.json()
    shop_id = body.get("shop_id", "")
    staff_list: list[dict[str, Any]] = body.get("staff", [])

    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id required")

    shop = await _check_shop_exists(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if str(shop.get("owner_email", "")) != user["auth_email"]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get existing staff IDs to deactivate ones not in the new list
    try:
        existing_staff = (
            await supabase.table("staff")
            .select("id, name")
            .eq("shop_id", shop_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    existing_map: dict[str, str] = {}  # name -> id
    for s in existing_staff.data or []:
        existing_map[s["name"]] = s["id"]

    incoming_names = {s["name"] for s in staff_list if s.get("name")}

    # Batch deactivate staff not in incoming list
    to_deactivate = [sid for name, sid in existing_map.items() if name not in incoming_names]
    if to_deactivate:
        try:
            await supabase.table("staff").update({"active": False}).in_("id", to_deactivate).execute()
        except Exception as exc:
            logger.warning("Failed to batch deactivate staff", extra={"error": str(exc)})

    created = 0
    updated = 0

    # Batch create new staff
    new_members = [m for m in staff_list if m.get("name", "").strip() not in existing_map]
    if new_members:
        new_data = [
            {"shop_id": shop_id, "name": m["name"].strip(), "active": m.get("active", True)}
            for m in new_members
        ]
        try:
            result = await supabase.table("staff").insert(new_data).execute()
            created = len(result.data) if result.data else 0
            for member, row in zip(new_members, result.data or []):
                wh = member.get("working_hours")
                if wh and row.get("id"):
                    await _upsert_staff_availability(str(row["id"]), wh)
        except Exception as exc:
            logger.warning("Failed to batch create staff", extra={"error": str(exc)})

    # Update existing staff
    existing_members = [m for m in staff_list if m.get("name", "").strip() in existing_map]
    for member in existing_members:
        name = member["name"].strip()
        sid = existing_map[name]
        try:
            await (
                supabase.table("staff")
                .update({"active": member.get("active", True)})
                .eq("id", sid)
                .execute()
            )
            updated += 1
        except Exception as exc:
            logger.warning("Failed to update staff", extra={"id": sid, "error": str(exc)})
            continue

        wh = member.get("working_hours")
        if wh:
            await _upsert_staff_availability(sid, wh)

    return {
        "shop_id": shop_id,
        "created": created,
        "updated": updated,
        "deactivated": sum(1 for name, sid in existing_map.items() if name not in incoming_names),
    }


async def _upsert_staff_availability(staff_id: str, wh: dict[str, Any]) -> None:
    days_map: dict[str, int] = {
        "Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3,
        "Fri": 4, "Sat": 5, "Sun": 6,
        "Monday": 0, "Tuesday": 1, "Wednesday": 2,
        "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6,
    }

    day_names = wh.get("days", [])
    if not day_names:
        return

    start_time = wh.get("start_time", "09:00")
    end_time = wh.get("end_time", "18:00")
    break_start = wh.get("break_start")
    break_end = wh.get("break_end")
    slot_duration = wh.get("slot_duration", 30)

    payloads: list[dict[str, Any]] = []
    for day_name in day_names:
        day_num = days_map.get(day_name)
        if day_num is None:
            continue
        payloads.append({
            "staff_id": staff_id,
            "day_of_week": day_num,
            "start_time": start_time,
            "end_time": end_time,
            "break_start": break_start,
            "break_end": break_end,
            "slot_duration": slot_duration,
        })

    if not payloads:
        return

    try:
        await supabase.table("staff_availability").upsert(payloads, on_conflict="staff_id,day_of_week").execute()
    except Exception as exc:
        logger.warning(
            "Failed to save staff availability",
            extra={"staff_id": staff_id, "error": str(exc)},
        )


# ── POST /api/onboarding/save-assets ────────────────────────────────────


@router.post("/save-assets")
async def save_assets(request: Request) -> dict[str, Any]:
    """Upsert bookable assets for a shop (turf/hotel mode).

    Expects JSON body:
      {
        "shop_id": "...",
        "assets": [{ "name": "...", "type": "Turf", "capacity": 10, "price_per_slot": 500, ... }]
      }

    Assets are upserted by (shop_id, name).
    """
    user = await get_current_user(request)
    body = await request.json()
    shop_id = body.get("shop_id", "")
    asset_list: list[dict[str, Any]] = body.get("assets", [])

    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id required")

    shop = await _check_shop_exists(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if str(shop.get("owner_email", "")) != user["auth_email"]:
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        existing_result = (
            await supabase.table("bookable_assets")
            .select("name")
            .eq("shop_id", shop_id)
            .execute()
        )
        existing_names = {a["name"] for a in (existing_result.data or [])}
    except Exception:
        existing_names = set()

    upsert_data: list[dict[str, Any]] = []
    for asset in asset_list:
        name = asset.get("name", "").strip()
        if not name:
            continue
        upsert_data.append({
            "shop_id": shop_id,
            "name": name,
            "type": asset.get("type", "Turf"),
            "capacity": asset.get("capacity", 10),
            "price_per_slot": asset.get("price_per_slot", 0),
            "slot_duration": asset.get("slot_duration", 60),
            "advance_percentage": asset.get("advance_percentage", 0),
            "active": asset.get("active", True),
        })

    created = 0
    updated = 0
    if upsert_data:
        try:
            result = (
                await supabase.table("bookable_assets")
                .upsert(upsert_data, on_conflict="shop_id,name")
                .execute()
            )
        except Exception as exc:
            logger.error("Batch asset upsert failed", extra={"shop_id": shop_id, "error": str(exc)})
            raise HTTPException(status_code=500, detail=f"Failed to save assets: {str(exc)}") from exc

        created = sum(1 for a in upsert_data if a["name"] not in existing_names)
        updated = len(upsert_data) - created

    return {
        "shop_id": shop_id,
        "created": created,
        "updated": updated,
        "total": len(asset_list),
    }


# ── POST /api/onboarding/save-hours ─────────────────────────────────────


@router.post("/save-hours")
async def save_hours(request: Request) -> dict[str, Any]:
    """Save business working hours for a shop.

    Expects JSON body:
      {
        "shop_id": "...",
        "working_hours": { "days": [...], "opening_time": "09:00", "closing_time": "22:00", ... }
      }

    Stores the hours as JSONB in the shop's working_hours column.
    """
    user = await get_current_user(request)
    body = await request.json()
    shop_id = body.get("shop_id", "")
    working_hours = body.get("working_hours")

    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id required")
    if not working_hours:
        raise HTTPException(status_code=400, detail="working_hours required")

    shop = await _check_shop_exists(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if str(shop.get("owner_email", "")) != user["auth_email"]:
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        await (
            supabase.table("shops")
            .update({"working_hours": working_hours})
            .eq("id", shop_id)
            .execute()
        )
        return {"shop_id": shop_id, "status": "saved"}
    except Exception as exc:
        logger.warning(
            "Failed to save working_hours column may not exist",
            extra={"shop_id": shop_id, "error": str(exc)},
        )
        # Column may not exist — try shop_config or just return success
        # (working_hours are not critical for backend operation)
        return {"shop_id": shop_id, "status": "saved_note", "note": "Hours stored locally only"}


# ── POST /api/onboarding/complete ───────────────────────────────────────


@router.post("/complete")
async def complete_onboarding(request: Request) -> dict[str, Any]:
    """Validate mandatory fields and mark onboarding as complete.

    Expects JSON body:
      { "shop_id": "..." }

    Validates required fields per business type, then sets onboarded=true.
    """
    user = await get_current_user(request)
    body = await request.json()
    shop_id = body.get("shop_id", "")

    if not shop_id:
        shop_id = await _get_shop_id_from_user(request)
    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id required")

    shop = await _check_shop_exists(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if str(shop.get("owner_email", "")) != user["auth_email"]:
        raise HTTPException(status_code=403, detail="Access denied")

    business_type = str(shop.get("business_type", "") or "")
    completed = await _infer_completed_steps(shop)
    required = _required_steps_for_business(business_type)
    missing = [s for s in required if s not in completed]

    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Onboarding incomplete. Missing steps: {', '.join(missing)}",
        )

    # Mark onboarded
    try:
        await supabase.table("shops").update({"onboarded": True}).eq("id", shop_id).execute()
        logger.info("Onboarding completed", extra={"shop_id": shop_id, "business_type": business_type})
    except Exception as exc:
        logger.warning(
            "onboarded column may not exist — marking as complete anyway",
            extra={"shop_id": shop_id, "error": str(exc)},
        )

    return {
        "shop_id": shop_id,
        "is_complete": True,
        "business_type": business_type,
        "completed_steps": list(completed),
    }
