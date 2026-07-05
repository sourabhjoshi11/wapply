"""WhatsApp Ordering Bot — FastAPI Application Entry Point.

Features:
- Webhook verification (Meta Cloud API)
- Batch entry webhook handling (all entries, not just [0])
- Webhook signature verification (SHA256)
- API key authentication for admin/management routes
- APScheduler for monthly subscription, reminders
- Static file serving for kitchen display
"""

from __future__ import annotations

import hashlib
import hmac
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import date
from typing import Any
from uuid import UUID

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.auth import router as auth_router
from app.api.billing import router as billing_router
from app.api.onboarding import router as onboarding_router
from app.auth import auth_by_jwt, get_current_shop, get_current_user, get_owned_resource, lookup_shop_by_owner_email, verify_shop_access
from app.config import settings
from app.database import supabase
from app.gateway.whatsapp_client import WhatsAppClient
from app.handlers.message_handler import handle_message
from app.services.appointment_service import AppointmentService
from app.services.billing_service import reset_monthly_counters
from app.services.booking_service import BookingService
from app.services.dinein_service import DineInService
from app.services.kitchen_service import KitchenService
from app.services.wallet_service import WalletService
from app.utils.logger import setup_logger
from app.utils.rate_limiter import rate_limiter

logger = setup_logger(__name__)

# ── Scheduler ────────────────────────────────────────────────────────────

scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")


# ── Lifespan ─────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan — start/stop scheduler."""
    logger.info("Starting scheduler...")
    scheduler.add_job(
        _monthly_subscription_deduct,
        trigger="cron",
        day=1,
        hour=9,
        minute=0,
        id="monthly_subscription",
        replace_existing=True,
    )
    scheduler.add_job(
        _check_appointment_reminders,
        trigger="interval",
        minutes=15,
        id="appointment_reminders",
        replace_existing=True,
    )
    scheduler.add_job(
        _billing_monthly_reset,
        trigger="cron",
        day=1,
        hour=0,
        minute=5,
        id="billing_monthly_reset",
        replace_existing=True,
    )
    scheduler.start()
    yield
    logger.info("Shutting down scheduler...")
    scheduler.shutdown(wait=False)


# ── App creation ─────────────────────────────────────────────────────────

app = FastAPI(
    title="WhatsApp Ordering Bot",
    version="2.0.0",
    lifespan=lifespan,
)

# In production, restrict CORS to configured frontend origins.
# allow_origins=["*"] with credentials is never used in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Rate limiting middleware ──────────────────────────────────────────────

DEFAULT_RATE_LIMIT = 100  # requests per window
RATE_LIMIT_WINDOW = 60  # seconds


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next: Any) -> Response:
    """Apply default IP-based rate limiting to all API endpoints except webhooks/health."""
    path = request.url.path

    # Skip rate limiting for non-API paths and webhooks
    if not path.startswith("/api/") or path in ("/api/health",):
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
    limiter_key = f"ip:{client_ip}"

    if not rate_limiter.check(limiter_key, DEFAULT_RATE_LIMIT, RATE_LIMIT_WINDOW, "general"):
        logger.warning("Rate limit exceeded", extra={"ip": client_ip, "path": path})
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please slow down."},
        )

    return await call_next(request)


app.include_router(auth_router, prefix="/api")
app.include_router(billing_router, prefix="/api")
app.include_router(onboarding_router, prefix="/api")


# ── Auth helpers ─────────────────────────────────────────────────────────


def verify_api_key(request: Request) -> None:
    """Verify admin API key from X-API-Key header.

    Raises 503 if no key configured, 401 if key mismatched.
    """
    if not settings.admin_api_key:
        raise HTTPException(status_code=503, detail="Server not configured for admin access")
    key = request.headers.get("X-API-Key", "")
    if key != settings.admin_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


async def verify_webhook_signature(request: Request, raw_body: bytes) -> bool:
    """Verify WhatsApp webhook signature using Meta's SHA256 method.

    Meta sends signature in X-Hub-Signature-256 header as:
        sha256=<hexdigest>

    Returns True if verified. Raises 500 if secret is not configured.
    """
    if not settings.whatsapp_webhook_secret:
        logger.error("Webhook secret not configured — rejecting webhook")
        raise HTTPException(
            status_code=500,
            detail="Webhook secret not configured. Set WHATSAPP_WEBHOOK_SECRET in environment.",
        )

    signature_header = request.headers.get("X-Hub-Signature-256", "")
    if not signature_header:
        logger.warning("Missing X-Hub-Signature-256 header")
        return False

    expected_signature = signature_header.replace("sha256=", "").strip()
    computed = hmac.new(
        settings.whatsapp_webhook_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(computed, expected_signature)


# ── Scheduled jobs ───────────────────────────────────────────────────────


async def _monthly_subscription_deduct() -> None:
    """Monthly subscription fee deduction — called by scheduler on 1st at 9AM."""
    logger.info("Starting monthly subscription deduction...")
    wallet = WalletService()
    try:
        await wallet.monthly_subscription_deduct()
        logger.info("Monthly subscription deduction completed")
    except Exception as exc:
        logger.error("Monthly subscription deduction failed", extra={"error": str(exc)})


async def _check_appointment_reminders() -> None:
    """Check and send appointment reminders — called every 15 minutes."""
    try:
        appt = AppointmentService()
        await appt.check_and_send_reminders()
    except Exception as exc:
        logger.error("Appointment reminder check failed", extra={"error": str(exc)})


async def _billing_monthly_reset() -> None:
    """Monthly billing cycle reset — runs 1st of every month at 00:05 IST."""
    logger.info("Starting monthly billing cycle reset...")
    try:
        await reset_monthly_counters()
        logger.info("Monthly billing cycle reset completed")
    except Exception as exc:
        logger.error("Monthly billing cycle reset failed", extra={"error": str(exc)})


# ══════════════════════════════════════════════════════════════════════════
# WEBHOOK — WhatsApp Cloud API
# ══════════════════════════════════════════════════════════════════════════


@app.api_route("/webhook", methods=["GET", "POST"])
async def whatsapp_webhook(request: Request) -> Response:
    """WhatsApp webhook endpoint.

    GET: Webhook verification (Meta challenge).
    POST: Incoming message handling (batch entries).
    """
    if request.method == "GET":
        return await _handle_verification(request)
    return await _handle_incoming(request)


async def _handle_verification(request: Request) -> Response:
    """Handle webhook verification challenge from Meta."""
    params = dict(request.query_params)
    mode = params.get("hub.mode", "")
    token = params.get("hub.verify_token", "")
    challenge = params.get("hub.challenge", "")

    if mode == "subscribe" and token == settings.whatsapp_verify_token:
        logger.info("Webhook verification successful")
        return Response(content=challenge, media_type="text/plain")

    logger.warning("Webhook verification failed", extra={"mode": mode})
    raise HTTPException(status_code=403, detail="Verification failed")


async def _handle_incoming(request: Request) -> Response:
    """Handle incoming WhatsApp messages — process all entries."""
    raw_body = await request.body()

    # Verify signature
    is_valid = await verify_webhook_signature(request, raw_body)
    if not is_valid:
        logger.warning("Invalid webhook signature")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse payload
    try:
        payload_data: dict[str, Any] = await request.json()
        logger.debug("Webhook payload received", extra={"entry_count": len(payload_data.get("entry", []))})
    except Exception:
        logger.error("Failed to parse webhook JSON body")
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Process ALL entries (not just entry[0])
    entries = payload_data.get("entry", [])
    if not entries:
        logger.warning("Webhook received with no entries")
        return Response(status_code=200, content='{"status":"ok"}', media_type="application/json")

    processed = 0
    failed = 0

    for entry_idx, entry in enumerate(entries):
        changes = entry.get("changes", [])
        for change in changes:
            value = change.get("value", {})
            messages = value.get("messages", [])

            # Determine shop identity from metadata
            metadata = value.get("metadata", {}) or {}
            phone_number_id = metadata.get("phone_number_id", "")

            if not phone_number_id:
                logger.warning("No phone_number_id in entry", extra={"entry_idx": entry_idx})
                continue

            # Route to correct shop(s)
            shops = await _get_shops_by_phone(phone_number_id)
            if not shops:
                logger.warning(
                    "No active shop for phone_number_id",
                    extra={"phone_number_id": phone_number_id},
                )
                continue

            for shop in shops:
                shop_id = shop["id"]
                access_token = shop.get("access_token", "")
                if not access_token:
                    logger.warning("Shop has no access token", extra={"shop_id": str(shop_id)})
                    continue

                # Process each message in this entry
                for msg in messages:
                    wa_id = msg.get("from", "")
                    if not wa_id:
                        continue

                    try:
                        # Check if shop is active
                        if not shop.get("active", True):
                            # Send paused message
                            client = WhatsAppClient(access_token, phone_number_id)
                            await client.send_message(
                                wa_id,
                                "⚠️ This shop is currently paused. "
                                "Please contact the owner to resume service.",
                            )
                            continue

                        await handle_message(
                            wa_id=wa_id,
                            message=msg,
                            access_token=access_token,
                            phone_number_id=phone_number_id,
                            shop_id=shop_id,
                        )
                        processed += 1
                    except Exception as exc:
                        failed += 1
                        logger.error(
                            "Failed to process message",
                            extra={
                                "wa_id": wa_id,
                                "shop_id": str(shop_id),
                                "error": str(exc),
                            },
                        )

    logger.info(
        "Webhook processing complete",
        extra={"processed": processed, "failed": failed, "total_entries": len(entries)},
    )
    return Response(status_code=200, content='{"status":"ok"}', media_type="application/json")


async def _get_shops_by_phone(phone_number_id: str) -> list[dict[str, Any]]:
    """Get active shops matching a phone number ID."""
    try:
        result = (
            await supabase.table("shops")
            .select("*")
            .eq("phone_number_id", phone_number_id)
            .eq("active", True)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        logger.error(
            "Failed to look up shops",
            extra={"phone_number_id": phone_number_id, "error": str(exc)},
        )
        return []


# ══════════════════════════════════════════════════════════════════════════
# ADMIN / MANAGEMENT ENDPOINTS (API Key required)
# ══════════════════════════════════════════════════════════════════════════


@app.get("/api/health")
async def health_check() -> dict[str, Any]:
    """Health check endpoint (public)."""
    return {"status": "ok", "version": "2.0.0"}


# ── Shop management ──────────────────────────────────────────────────────


@app.post("/api/shops/create")
async def create_shop(request: Request) -> dict[str, Any]:
    """Create a new shop from onboarding basic details.

    Requires JWT auth (Bearer token). Derives owner_email and owner_user_id
    from the authenticated Supabase user — body owner_email is ignored.
    Enforces one-shop-per-user.

    Accepts both multipart/form-data (with optional logo file)
    and application/json. Returns shop_id + api_key.
    """
    import uuid as uuid_mod

    # Authenticate from JWT
    user = await get_current_user(request)
    owner_email = user["auth_email"]
    owner_user_id = user["auth_user_id"]

    # One-shop-per-user: check if user already has a shop
    existing = await lookup_shop_by_owner_email(owner_email)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="You already have a shop. Multiple shops per user are not supported.",
        )

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
    name = data.get("name", "")
    owner_whatsapp = data.get("owner_whatsapp", "")
    language = data.get("language", "hi")
    business_type = data.get("business_type", "shop")
    category = data.get("category", "")
    city = data.get("city", "")

    # Generate API key
    api_key = str(uuid_mod.uuid4())

    # Use owner number as temporary whatsapp_number (UNIQUE NOT NULL)
    whatsapp_number = owner_whatsapp or f"temp_{uuid_mod.uuid4().hex[:12]}"

    # Build insert payload — includes all columns known to exist in the table.
    # Some columns (owner_name, business_type, etc.) may have been added by
    # migrations, so we wrap the full insert in a try/except and fall back to
    # a minimal set below.
    base_payload: dict[str, Any] = {
        "name": name,
        "whatsapp_number": whatsapp_number,
        "owner_whatsapp_number": owner_whatsapp,
        "owner_name": owner_name,
        "owner_email": owner_email,
        "api_key": api_key,
        "default_language": language,
        "business_type": business_type,
        "category": category,
        "city": city,
    }

    # Try full insert first (all columns)
    extended_payload = {**base_payload}

    try:
        result = await supabase.table("shops").insert(extended_payload).execute()
    except Exception:
        logger.warning("Extended shop insert failed — trying base columns only")
        try:
            result = await supabase.table("shops").insert(base_payload).execute()
        except Exception as exc:
            err_str = str(exc)
            resp_body = ""
            if hasattr(exc, "response") and exc.response is not None:
                try:
                    resp_body = exc.response.text
                except Exception:
                    pass
            logger.error("Failed to create shop", extra={"error": err_str, "response": resp_body})
            combined = (err_str + " " + resp_body).lower()
            if "duplicate key" in combined or "unique constraint" in combined:
                raise HTTPException(
                    status_code=409,
                    detail="This WhatsApp number is already registered. Please use a different number or contact support.",
                )
            raise HTTPException(status_code=500, detail=f"Failed to create shop: {err_str}")

        shop_id = result.data[0]["id"]
        try:
            await (
                supabase.table("shops")
                .update({"api_key": api_key})
                .eq("id", shop_id)
                .execute()
            )
        except Exception:
            logger.warning("api_key column not found — generating fallback uuid4 key")
            api_key = str(uuid_mod.uuid4())

    shop = result.data[0]
    shop_id_str = str(shop["id"])
    logger.info("Shop created", extra={"shop_id": shop_id_str})

    return {"shop_id": shop_id_str, "api_key": api_key}


@app.get("/api/shops")
async def list_shops(request: Request) -> list[dict[str, Any]]:
    """List all shops."""
    verify_api_key(request)
    result = await supabase.table("shops").select("*").order("name").execute()
    return result.data or []


# ── Shop /me endpoints ─────────────────────────────────────────────────


@app.get("/api/shops/me")
async def get_my_shop(request: Request) -> dict[str, Any]:
    """Get the current shop by API key from X-API-Key header."""
    shop = await _get_shop_by_api_key(request)
    # Expose default_language as "language" for frontend form compatibility
    if "default_language" in shop and "language" not in shop:
        shop["language"] = shop["default_language"]
    return shop


@app.put("/api/shops/me")
async def update_my_shop(request: Request) -> dict[str, Any]:
    """Update the current shop by API key.

    Maps frontend field names to actual DB column names.
    """
    shop = await _get_shop_by_api_key(request)
    body = await request.json()

    # Map frontend "language" → DB "default_language"
    if "language" in body and "default_language" not in body:
        body["default_language"] = body.pop("language")

    # Only keep known updatable columns
    allowed = {"name", "owner_name", "city", "default_language"}
    update: dict[str, Any] = {k: v for k, v in body.items() if k in allowed}

    shop_id = shop["id"]
    await (
        supabase.table("shops")
        .update(update)
        .eq("id", str(shop_id))
        .execute()
    )
    return {"status": "updated"}


@app.get("/api/shops/{shop_id}")
async def get_shop(shop_id: UUID, request: Request) -> dict[str, Any]:
    """Get a shop by ID."""
    verify_api_key(request)
    result = (
        await supabase.table("shops")
        .select("*")
        .eq("id", str(shop_id))
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Shop not found")
    return result.data


@app.patch("/api/shops/{shop_id}")
async def update_shop(shop_id: UUID, request: Request) -> dict[str, Any]:
    """Update shop settings (pause/resume, mode, etc.)."""
    verify_api_key(request)
    body = await request.json()
    # Whitelist allowed fields — never pass raw body to DB update
    allowed_fields = {
        "active", "mode", "name", "upi_id", "city",
        "business_type", "category", "default_language",
        "owner_name", "access_token", "phone_number_id",
        "whatsapp_number",
    }
    sanitized = {k: v for k, v in body.items() if k in allowed_fields}
    if not sanitized:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    await (
        supabase.table("shops")
        .update(sanitized)
        .eq("id", str(shop_id))
        .execute()
    )
    return {"status": "updated"}


# ── Products ─────────────────────────────────────────────────────────────


@app.get("/api/shops/{shop_id}/products")
async def list_products(shop_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> list[dict[str, Any]]:
    """List products for a shop."""
    verify_shop_access(current_shop, shop_id)
    result = (
        await supabase.table("products")
        .select("*")
        .eq("shop_id", str(shop_id))
        .order("name")
        .execute()
    )
    return result.data or []


@app.post("/api/shops/{shop_id}/products")
async def create_product(shop_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> dict[str, Any]:
    """Create a product."""
    verify_shop_access(current_shop, shop_id)
    body = await request.json()
    body["shop_id"] = str(shop_id)
    result = await supabase.table("products").insert(body).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create product")
    return result.data[0]


@app.patch("/api/products/{product_id}")
async def update_product(product_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> dict[str, Any]:
    """Update a product."""
    if current_shop is not None:
        await get_owned_resource("products", product_id, current_shop["id"])
    body = await request.json()
    await (
        supabase.table("products")
        .update(body)
        .eq("id", str(product_id))
        .execute()
    )
    return {"status": "updated"}


@app.delete("/api/products/{product_id}")
async def delete_product(product_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> dict[str, Any]:
    """Delete (deactivate) a product."""
    if current_shop is not None:
        await get_owned_resource("products", product_id, current_shop["id"])
    await (
        supabase.table("products")
        .update({"available": False})
        .eq("id", str(product_id))
        .execute()
    )
    return {"status": "deleted"}


# ── Bulk Products ─────────────────────────────────────────────────────────


@app.post("/api/products/bulk")
async def bulk_create_products(request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> list[dict[str, Any]]:
    """Bulk create products for a shop."""
    body = await request.json()
    shop_id = body.get("shop_id", "")
    products_data = body.get("products", [])

    if not shop_id or not products_data:
        raise HTTPException(status_code=400, detail="shop_id and products required")

    # Non-admin: enforce that shop_id matches authenticated shop
    if current_shop is not None and str(shop_id) != str(current_shop["id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    # Batch insert all products at once
    for product in products_data:
        product["shop_id"] = shop_id
    result = await supabase.table("products").insert(products_data).execute()
    return result.data or []


# ── Orders ───────────────────────────────────────────────────────────────


@app.get("/api/shops/{shop_id}/orders")
async def list_orders(shop_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> list[dict[str, Any]]:
    """List orders for a shop."""
    verify_shop_access(current_shop, shop_id)
    result = (
        await supabase.table("orders")
        .select("*")
        .eq("shop_id", str(shop_id))
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@app.patch("/api/orders/{order_id}")
async def update_order_status(order_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> dict[str, Any]:
    """Update order status."""
    if current_shop is not None:
        await get_owned_resource("orders", order_id, current_shop["id"])
    body = await request.json()
    await (
        supabase.table("orders")
        .update(body)
        .eq("id", str(order_id))
        .execute()
    )
    return {"status": "updated"}


# ── Tables (Dine-in) ─────────────────────────────────────────────────────


@app.get("/api/shops/{shop_id}/tables")
async def list_tables(shop_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> list[dict[str, Any]]:
    """List dine-in tables for a shop."""
    verify_shop_access(current_shop, shop_id)
    dine_in = DineInService()
    return await dine_in.get_available_tables(shop_id)


@app.post("/api/shops/{shop_id}/tables")
async def create_table(shop_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> dict[str, Any]:
    """Create a dine-in table."""
    verify_shop_access(current_shop, shop_id)
    body = await request.json()
    dine_in = DineInService()
    table = await dine_in.create_table(
        shop_id, body.get("table_number", 1), body.get("table_name")
    )
    if not table:
        raise HTTPException(status_code=500, detail="Failed to create table")
    return table


@app.post("/api/shops/{shop_id}/tables/generate-qrs")
async def generate_table_qrs(shop_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> list[dict[str, Any]]:
    """Generate QR codes for all tables."""
    verify_shop_access(current_shop, shop_id)
    dine_in = DineInService()
    return await dine_in.generate_all_qrs(shop_id)


# ── Kitchen ──────────────────────────────────────────────────────────────


@app.get("/api/shops/{shop_id}/kitchen-orders")
async def list_kitchen_orders(shop_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> list[dict[str, Any]]:
    """Get active kitchen orders."""
    verify_shop_access(current_shop, shop_id)
    kitchen = KitchenService()
    return await kitchen.get_active_orders(shop_id)


@app.patch("/api/kitchen-orders/{kitchen_order_id}")
async def update_kitchen_order(
    kitchen_order_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)
) -> dict[str, Any]:
    """Update kitchen order status."""
    if current_shop is not None:
        await get_owned_resource("kitchen_orders", kitchen_order_id, current_shop["id"])
    body = await request.json()
    kitchen = KitchenService()
    success = await kitchen.update_status(
        kitchen_order_id, body.get("status", "preparing")
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update")
    return {"status": "updated"}


# ── Wallet ───────────────────────────────────────────────────────────────


@app.get("/api/shops/{shop_id}/wallet")
async def get_wallet(shop_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> dict[str, Any]:
    """Get shop wallet balance and info."""
    verify_shop_access(current_shop, shop_id)
    wallet = WalletService()
    balance = await wallet.get_balance(shop_id)
    return {"shop_id": str(shop_id), "balance": float(balance)}


# ── Appointments ─────────────────────────────────────────────────────────


@app.get("/api/shops/{shop_id}/appointments")
async def list_appointments(
    shop_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop), booking_date: str | None = None
) -> list[dict[str, Any]]:
    """Get appointments for a shop."""
    verify_shop_access(current_shop, shop_id)
    appt = AppointmentService()
    dt = date.fromisoformat(booking_date) if booking_date else None
    return await appt.get_daily_appointments(shop_id, dt)


# ── Bookings ─────────────────────────────────────────────────────────────


@app.get("/api/shops/{shop_id}/bookings")
async def list_bookings(
    shop_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop), booking_date: str | None = None
) -> list[dict[str, Any]]:
    """Get asset bookings for a shop."""
    verify_shop_access(current_shop, shop_id)
    bsvc = BookingService()
    dt = date.fromisoformat(booking_date) if booking_date else None
    return await bsvc.get_bookings(shop_id, dt)


# ── Send message (admin trigger) ─────────────────────────────────────────


@app.post("/api/shops/{shop_id}/send-test")
async def send_test_message(shop_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> dict[str, Any]:
    """Send a test message via WhatsApp from a shop."""
    verify_shop_access(current_shop, shop_id)
    body = await request.json()
    to = body.get("to", "")
    text = body.get("text", "Test message from admin panel.")
    if not to:
        raise HTTPException(status_code=400, detail="Missing 'to' field")

    shop = await _get_shop_by_id(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    client = WhatsAppClient(shop["access_token"], shop["phone_number_id"])
    result = await client.send_message(to, text)
    if result:
        return {"status": "sent", "message_id": result.get("messages", [{}])[0].get("id")}
    raise HTTPException(status_code=500, detail="Failed to send message")


async def _get_shop_by_id(shop_id: UUID) -> dict[str, Any] | None:
    """Fetch shop by UUID."""
    result = (
        await supabase.table("shops")
        .select("*")
        .eq("id", str(shop_id))
        .maybe_single()
        .execute()
    )
    return result.data


async def _get_shop_by_api_key(request: Request) -> dict[str, Any]:
    """Look up shop by JWT (Bearer token). Raises 401 if invalid, 404 if not found."""
    jwt_result = await auth_by_jwt(request)
    
    if jwt_result is None:
        raise HTTPException(status_code=401, detail="Invalid or missing authentication")
        
    if "id" not in jwt_result:
        raise HTTPException(status_code=404, detail="Shop not found")
        
    return jwt_result


# ── Wallet endpoints ──────────────────────────────────────────────────────


@app.post("/api/wallet/credit")
async def credit_wallet(request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> dict[str, Any]:
    """Credit money to a shop's wallet after Razorpay payment."""
    body = await request.json()
    # Use authenticated shop_id, fallback to body shop_id for backward compat
    shop_id = str(current_shop["id"]) if current_shop else body.get("shop_id", "")
    amount = body.get("amount", 0)
    razorpay_payment_id = body.get("razorpay_payment_id", "")
    razorpay_order_id = body.get("razorpay_order_id", "")

    if not shop_id or not amount:
        raise HTTPException(status_code=400, detail="shop_id and amount required")

    wallet = WalletService()
    await wallet.ensure_wallet(UUID(shop_id))
    description = (
        f"Razorpay payment {razorpay_payment_id} "
        f"(order {razorpay_order_id})"
    )
    success = await wallet.credit(UUID(shop_id), Decimal(str(amount)), description)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to credit wallet")

    return {"status": "credited", "amount": amount}


@app.post("/api/recharge")
async def recharge_wallet(request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> dict[str, Any]:
    """Create a Razorpay order for wallet recharge.

    Expects JSON body:
      { "amount": 500 }

    Shop is derived from JWT auth; fallback to body shop_id for admin.
    Returns:
      { "order_id": "...", "amount": 500, "currency": "INR" }
    """
    body = await request.json()
    amount = body.get("amount", 0)
    # Derive shop_id from auth, fallback to request body for admin backward compat
    shop_id = str(current_shop["id"]) if current_shop else body.get("shop_id", "")

    if not shop_id or not amount:
        raise HTTPException(status_code=400, detail="shop_id and amount required")

    from app.services.billing_service import RazorpayClient

    rc = RazorpayClient()
    amount_paise = int(amount) * 100
    receipt = f"recharge_{shop_id}_{int(__import__('time').time())}"
    razorpay_order = await rc.create_order(
        amount_paise=amount_paise,
        receipt=receipt,
        notes={"shop_id": str(shop_id), "type": "wallet_recharge"},
    )

    return {
        "order_id": razorpay_order.get("id", ""),
        "amount": amount_paise,
        "currency": "INR",
    }


@app.post("/api/wallet/verify-payment")
async def verify_wallet_payment(
    request: Request,
    current_shop: dict[str, Any] | None = Depends(get_current_shop),
) -> dict[str, Any]:
    """Verify a Razorpay payment and credit the wallet.

    Expects JSON body:
      {
        "razorpay_payment_id": "pay_...",
        "razorpay_order_id": "order_...",
        "shop_id": "...",
        "amount": 500
      }

    Verifies with Razorpay API first, then credits the wallet.
    """
    body = await request.json()
    shop_id = str(current_shop["id"]) if current_shop else body.get("shop_id", "")
    amount = body.get("amount", 0)
    razorpay_payment_id = body.get("razorpay_payment_id", "")
    razorpay_order_id = body.get("razorpay_order_id", "")

    if not shop_id or not amount or not razorpay_payment_id:
        raise HTTPException(status_code=400, detail="shop_id, amount, and razorpay_payment_id required")

    # Verify payment with Razorpay API
    from app.services.billing_service import RazorpayClient

    rc = RazorpayClient()
    try:
        payment = await rc.fetch_payment(razorpay_payment_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to verify payment: {exc}") from exc

    payment_status = payment.get("status", "")
    if payment_status != "captured":
        raise HTTPException(
            status_code=400,
            detail=f"Payment not captured (status: {payment_status})",
        )

    # Credit the wallet
    wallet = WalletService()
    await wallet.ensure_wallet(UUID(shop_id))
    description = f"Razorpay payment {razorpay_payment_id} (order {razorpay_order_id})"
    success = await wallet.credit(UUID(shop_id), Decimal(str(amount)), description)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to credit wallet")

    return {"status": "credited", "amount": amount}


@app.get("/api/wallet/transactions")
async def get_wallet_transactions(request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> list[dict[str, Any]]:
    """Get wallet transactions for a shop."""
    shop_id = str(current_shop["id"]) if current_shop else request.query_params.get("shop_id", "")
    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id required")

    result = (
        await supabase.table("wallet_transactions")
        .select("*")
        .eq("shop_id", shop_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


# ── Customers endpoint ────────────────────────────────────────────────────


@app.get("/api/shops/{shop_id}/customers")
async def list_customers(shop_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> list[dict[str, Any]]:
    """Get unique customers for a shop from conversations and orders."""
    verify_shop_access(current_shop, shop_id)
    # Get from conversations
    conv_result = (
        await supabase.table("conversations")
        .select("customer_number, updated_at")
        .eq("shop_id", str(shop_id))
        .order("updated_at", desc=True)
        .execute()
    )
    conv_data = conv_result.data or []

    # Get from orders for additional info
    order_result = (
        await supabase.table("orders")
        .select("customer_number, total, created_at, status")
        .eq("shop_id", str(shop_id))
        .order("created_at", desc=True)
        .execute()
    )
    order_data = order_result.data or []

    # Merge: one entry per unique customer
    seen: set[str] = set()
    customers: list[dict[str, Any]] = []
    for c in conv_data:
        num = c.get("customer_number", "")
        if num and num not in seen:
            seen.add(num)
            customer_orders = [o for o in order_data if o.get("customer_number") == num]
            total_spent = sum(float(o.get("total", 0)) for o in customer_orders)
            customers.append({
                "customer_number": num,
                "total_orders": len(customer_orders),
                "total_spent": total_spent,
                "last_active": c.get("updated_at", ""),
                "last_order_status": customer_orders[0].get("status", "") if customer_orders else "",
            })

    # Also add customers from orders not in conversations
    for o in order_data:
        num = o.get("customer_number", "")
        if num and num not in seen:
            seen.add(num)
            customer_orders = [x for x in order_data if x.get("customer_number") == num]
            total_spent = sum(float(x.get("total", 0)) for x in customer_orders)
            customers.append({
                "customer_number": num,
                "total_orders": len(customer_orders),
                "total_spent": total_spent,
                "last_active": o.get("created_at", ""),
                "last_order_status": o.get("status", ""),
            })

    return customers


# ── WhatsApp verification endpoints ────────────────────────────────────────

# In-memory OTP store: phone_number -> {"otp": str, "expires_at": float}
_otp_store: dict[str, dict[str, Any]] = {}
import time as time_mod
import random


@app.post("/api/verify-whatsapp/send")
async def send_whatsapp_otp(request: Request) -> dict[str, str]:
    """Send OTP to a WhatsApp number for verification.

    In production, this would send via WhatsApp Cloud API.
    For development, OTP "000000" always works.
    """
    body = await request.json()
    phone_number = body.get("phone_number", "")

    if not phone_number:
        raise HTTPException(status_code=400, detail="phone_number required")

    # Rate limit: max 3 OTP sends per phone number per 15 minutes
    if not rate_limiter.check(f"otp_send:{phone_number}", 3, 900, "otp"):
        logger.warning("OTP send rate limit hit", extra={"phone": phone_number})
        raise HTTPException(
            status_code=429,
            detail="Too many OTP requests. Please try again later.",
        )

    # Generate 6-digit OTP
    otp = f"{random.randint(0, 999999):06d}"
    _otp_store[phone_number] = {
        "otp": otp,
        "expires_at": time_mod.time() + 300,  # 5 min expiry
        "attempts": 0,  # Track verification attempts
    }

    logger.info(
        "WhatsApp OTP generated",
        extra={"phone": phone_number},
    )

    # Try to send via WhatsApp if shop has access_token
    # Otherwise, OTP will be shown in server logs for dev
    return {"status": "sent", "message": "OTP sent successfully"}


@app.post("/api/verify-whatsapp/verify")
async def verify_whatsapp_otp(request: Request) -> dict[str, str]:
    """Verify OTP sent to WhatsApp number."""
    body = await request.json()
    phone_number = body.get("phone_number", "")
    otp = body.get("otp", "")

    if not phone_number or not otp:
        raise HTTPException(status_code=400, detail="phone_number and otp required")

    # Dev override: "000000" only works in non-production debug mode
    if otp == "000000" and settings.debug and os.getenv("ENV", "development") != "production":
        return {"status": "verified", "message": "OTP verified successfully"}

    stored = _otp_store.get(phone_number)
    if not stored:
        raise HTTPException(status_code=400, detail="No OTP sent to this number")

    if time_mod.time() > stored["expires_at"]:
        _otp_store.pop(phone_number, None)
        raise HTTPException(status_code=400, detail="OTP expired")

    # Track and rate-limit OTP verification attempts (max 5 per OTP)
    stored["attempts"] = stored.get("attempts", 0) + 1
    if stored["attempts"] > 5:
        _otp_store.pop(phone_number, None)
        raise HTTPException(
            status_code=429,
            detail="Too many failed OTP attempts. Request a new OTP.",
        )

    if stored["otp"] != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    _otp_store.pop(phone_number, None)
    return {"status": "verified", "message": "OTP verified successfully"}


# ── WhatsApp Embedded Signup ────────────────────────────────────────────────


@app.post("/api/whatsapp/register")
async def register_whatsapp_credentials(request: Request) -> dict[str, Any]:
    """Store WhatsApp Embedded Signup credentials for a shop.

    After a successful Meta Embedded Signup (shop owner connects their
    WhatsApp Business number via FB login popup), the frontend sends
    the returned access_token and phone_number_id here for storage.
    """
    user = await get_current_user(request)
    body = await request.json()
    shop_id = body.get("shop_id", "")
    access_token = body.get("access_token", "")
    phone_number_id = body.get("phone_number_id", "")
    business_phone = body.get("business_phone", "")

    if not shop_id or not access_token or not phone_number_id:
        raise HTTPException(
            status_code=400,
            detail="shop_id, access_token, and phone_number_id are required",
        )

    shop = await _get_shop_by_id(UUID(shop_id))
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    shop_email = str(shop.get("owner_email", ""))
    user_email = str(user.get("auth_email", ""))
    if shop_email and user_email and shop_email != user_email:
        raise HTTPException(status_code=403, detail="Access denied")

    update_data: dict[str, Any] = {
        "access_token": access_token,
        "phone_number_id": phone_number_id,
    }
    if business_phone:
        clean = business_phone.replace("+", "")
        update_data["whatsapp_number"] = clean

    try:
        await (
            supabase.table("shops")
            .update(update_data)
            .eq("id", shop_id)
            .execute()
        )
        logger.info(
            "WhatsApp credentials saved via Embedded Signup",
            extra={"shop_id": shop_id, "phone_number_id": phone_number_id},
        )
        return {"status": "ok", "message": "WhatsApp credentials saved"}
    except Exception as exc:
        logger.error(
            "Failed to save WhatsApp credentials",
            extra={"shop_id": shop_id, "error": str(exc)},
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save credentials: {str(exc)}",
        ) from exc


# ── Table delete ────────────────────────────────────────────────────────────


@app.delete("/api/tables/{table_id}")
async def delete_table(table_id: UUID, request: Request, current_shop: dict[str, Any] | None = Depends(get_current_shop)) -> dict[str, str]:
    """Delete a dine-in table."""
    if current_shop is not None:
        await get_owned_resource("tables", table_id, current_shop["id"])
    await supabase.table("tables").delete().eq("id", str(table_id)).execute()
    return {"status": "deleted"}


# ══════════════════════════════════════════════════════════════════════════
# STATIC FILES — Kitchen Display
# ══════════════════════════════════════════════════════════════════════════


STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

# Mount static directory — serves onboarding.html, checklist.html etc.
if os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/kitchen/{shop_id}")
async def kitchen_display(shop_id: UUID) -> HTMLResponse:
    """Serve the kitchen display dashboard for a specific shop."""
    html_path = os.path.join(STATIC_DIR, "kitchen_display.html")
    if not os.path.isfile(html_path):
        return HTMLResponse(
            content="<html><body><h1>Kitchen Display not found. Run 'python scripts/generate_kitchen_display.py'</h1></body></html>",
            status_code=404,
        )
    with open(html_path, encoding="utf-8") as f:
        html = f.read()
    return HTMLResponse(content=html)


# ══════════════════════════════════════════════════════════════════════════
# DIRECT RUN
# ══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
