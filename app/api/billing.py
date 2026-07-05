"""Billing API routes — Razorpay webhook and billing history.

Endpoints:
  POST /billing/razorpay-webhook  — Incoming Razorpay event webhook
  GET  /billing/{shop_id}/history — Billing ledger for a shop (API key auth)
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth import get_current_shop, verify_shop_access
from app.database import supabase
from app.services.billing_service import (
    PLAN_CONFIG,
    RazorpayClient,
    confirm_extra_order_payment,
    get_billing_history,
    handle_subscription_charged,
)
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])


# ══════════════════════════════════════════════════════════════════════════
# RAZORPAY WEBHOOK
# ══════════════════════════════════════════════════════════════════════════


@router.post("/razorpay-webhook")
async def razorpay_webhook(request: Request) -> dict[str, str]:
    """Handle incoming Razorpay webhook events.

    Supported events:
      - payment.captured (for extra_order_batch)
      - subscription.charged (for monthly autopay)

    Always returns 200 quickly; processing is done synchronously
    because Razorpay expects a prompt response.
    """
    raw_body = await request.body()

    # Verify webhook signature
    signature = request.headers.get("X-Razorpay-Signature", "")
    if not signature:
        logger.warning("Razorpay webhook: missing signature header")
        raise HTTPException(status_code=400, detail="Missing signature")

    try:
        rc = RazorpayClient()
    except RuntimeError as exc:
        logger.error("Razorpay webhook: client not available", extra={"error": str(exc)})
        raise HTTPException(status_code=503, detail="Payment system unavailable")

    if not rc.verify_webhook_signature(raw_body, signature):
        logger.warning("Razorpay webhook: invalid signature")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse payload
    try:
        payload: dict[str, Any] = json.loads(raw_body)
    except Exception:
        logger.error("Razorpay webhook: failed to parse JSON body")
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event", "")
    event_payload = payload.get("payload", {})

    logger.info("Razorpay webhook event received", extra={"event": event})

    try:
        if event == "payment.captured":
            payment = event_payload.get("payment", {}).get("entity", {})
            order_id = payment.get("order_id", "")
            payment_id = payment.get("id", "")
            notes = payment.get("notes", {}) or {}
            payment_type = notes.get("type", "")

            if payment_type == "extra_order_batch":
                await confirm_extra_order_payment(
                    razorpay_payment_id=payment_id,
                    razorpay_order_id=order_id,
                )
            else:
                logger.info(
                    "Ignoring payment.captured for non-batch type",
                    extra={"type": payment_type},
                )

        elif event == "subscription.charged":
            sub = event_payload.get("subscription", {}).get("entity", {})
            payment = event_payload.get("payment", {}).get("entity", {})
            subscription_id = sub.get("id", "")
            payment_id = payment.get("id", "")
            amount_paise = payment.get("amount", 0)

            await handle_subscription_charged(
                razorpay_payment_id=payment_id,
                razorpay_subscription_id=subscription_id,
                amount_paise=amount_paise,
            )

        else:
            logger.info(
                "Razorpay webhook: unhandled event",
                extra={"event": event},
            )

    except Exception as exc:
        logger.error(
            "Razorpay webhook processing error",
            extra={"event": event, "error": str(exc)},
        )

    return {"status": "ok"}


# ══════════════════════════════════════════════════════════════════════════
# BILLING HISTORY
# ══════════════════════════════════════════════════════════════════════════


@router.get("/{shop_id}/history")
async def billing_history(
    shop_id: UUID,
    request: Request,
    current_shop: dict[str, Any] | None = Depends(get_current_shop),
) -> dict[str, Any]:
    """Return aggregated billing history for a shop (for dashboard display).

    Uses shop API key auth; returns plan info, limits, usage, and transactions
    in the BillingHistoryResponse format expected by the frontend.
    """
    verify_shop_access(current_shop, shop_id)

    # Fetch shop for plan/usage info
    shop_result = (
        await supabase.table("shops")
        .select("id, plan, orders_this_month, extra_orders_purchased, "
                "subscription_status, billing_cycle_start, razorpay_subscription_id")
        .eq("id", str(shop_id))
        .maybe_single()
        .execute()
    )
    shop = shop_result.data or {}

    plan: str | None = shop.get("plan")
    plan_config = PLAN_CONFIG.get(plan, {}) if plan else {}
    order_limit = plan_config.get("limit", 0)
    monthly_order_count = int(shop.get("orders_this_month", 0))
    extra_orders_purchased = int(shop.get("extra_orders_purchased", 0))
    sub_status = shop.get("subscription_status", "")
    billing_paused = sub_status in ("paused", "expired")
    mode = "subscription" if shop.get("razorpay_subscription_id") else "wallet"

    # Fetch raw ledger rows
    ledger_rows = await get_billing_history(shop_id)

    # Map to BillingTransaction format
    transactions: list[dict[str, Any]] = []
    for row in ledger_rows:
        txn_type = row.get("type", "")
        mapped_type: str
        if txn_type == "monthly_subscription":
            mapped_type = "subscription_charge"
        elif txn_type == "extra_order_batch":
            mapped_type = "extra_batch"
        elif txn_type == "plan_upgrade":
            mapped_type = "plan_upgrade"
        elif txn_type == "refund":
            mapped_type = "refund"
        else:
            mapped_type = txn_type

        transactions.append({
            "id": row.get("id", ""),
            "shop_id": str(shop_id),
            "type": mapped_type,
            "amount": float(row.get("amount", 0)),
            "description": row.get("description", ""),
            "plan": plan,
            "payment_id": row.get("razorpay_payment_id"),
            "order_id": row.get("razorpay_order_id"),
            "created_at": row.get("created_at", ""),
        })

    return {
        "shop_id": str(shop_id),
        "plan": plan,
        "order_limit": order_limit,
        "monthly_order_count": monthly_order_count,
        "extra_orders_purchased": extra_orders_purchased,
        "billing_paused": billing_paused,
        "mode": mode,
        "billing_cycle_start": shop.get("billing_cycle_start"),
        "razorpay_subscription_id": shop.get("razorpay_subscription_id"),
        "transactions": transactions,
    }
