"""Billing service — plan limits, order gating, Razorpay payments, monthly reset.

Pay-as-you-cross billing model combined with monthly Razorpay autopay:
  - Basic:   ₹299/month — 500 orders included
  - Standard: ₹499/month — 1000 orders included
  - Pro:     ₹799/month — 2000 orders included

A shop can never generate more orders than it has paid for within the
current month. The bot hard-pauses the moment the included limit is hit,
and only resumes after the owner pays for an extra order batch.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

import razorpay

from app.config import settings
from app.database import supabase
from app.gateway.whatsapp_client import WhatsAppClient
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

# ── Plan configuration ────────────────────────────────────────────────────

PLAN_CONFIG: dict[str, dict[str, Any]] = {
    "basic": {"price": 299, "limit": 500, "extra_rate": 1.00},
    "standard": {"price": 499, "limit": 1000, "extra_rate": 1.00},
    "pro": {"price": 799, "limit": 2000, "extra_rate": 0.50},
}

VALID_BATCH_SIZES = [50, 100, 200]

RECHARGE_CONTACT = "https://wa.me/919999999999"  # TODO: make configurable per shop


# ── Razorpay client (lazy singleton) ──────────────────────────────────────


class RazorpayClient:
    """Async wrapper around the synchronous Razorpay SDK.

    Uses a thread pool to avoid blocking the event loop.
    """

    def __init__(self) -> None:
        if not settings.razorpay_key_id or not settings.razorpay_key_secret:
            raise RuntimeError("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set")
        self._client = razorpay.Client(
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret)
        )

    async def create_order(self, amount_paise: int, receipt: str, notes: dict[str, str]) -> dict[str, Any]:
        """Create a Razorpay order."""
        payload = {
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt[:40],
            "notes": notes,
        }
        return await asyncio.to_thread(self._client.order.create, payload)

    async def fetch_order(self, order_id: str) -> dict[str, Any]:
        """Fetch an order by ID."""
        return await asyncio.to_thread(self._client.order.fetch, order_id)

    async def fetch_payment(self, payment_id: str) -> dict[str, Any]:
        """Fetch a payment by ID."""
        return await asyncio.to_thread(self._client.payment.fetch, payment_id)

    def verify_webhook_signature(self, body: bytes, signature: str) -> bool:
        """Verify Razorpay webhook HMAC SHA256 signature."""
        expected = hmac.new(
            settings.razorpay_webhook_secret.encode("utf-8"),
            body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)


# ── Helpers ───────────────────────────────────────────────────────────────


def get_plan_limit(plan: str) -> int:
    """Return the monthly order limit for the given plan.

    Args:
        plan: One of 'basic', 'standard', 'pro'.

    Returns:
        Number of orders included per month.
    """
    config = PLAN_CONFIG.get(plan.lower(), PLAN_CONFIG["basic"])
    return config["limit"]


def _get_plan_rate(plan: str) -> float:
    """Return extra-order per-order rate for the plan."""
    config = PLAN_CONFIG.get(plan.lower(), PLAN_CONFIG["basic"])
    return config["extra_rate"]


def _get_plan_price(plan: str) -> int:
    """Return monthly subscription price for the plan."""
    config = PLAN_CONFIG.get(plan.lower(), PLAN_CONFIG["basic"])
    return config["price"]


async def _get_shop(shop_id: UUID) -> dict[str, Any] | None:
    """Fetch a shop record by ID."""
    try:
        result = (
            await supabase.table("shops")
            .select("*")
            .eq("id", str(shop_id))
            .maybe_single()
            .execute()
        )
        return result.data
    except Exception as exc:
        logger.error("Failed to fetch shop", extra={"shop_id": str(shop_id), "error": str(exc)})
        return None


def _razorpay_client() -> RazorpayClient | None:
    """Get the Razorpay client singleton, or None if not configured."""
    try:
        return RazorpayClient()
    except RuntimeError as exc:
        logger.error("Razorpay not configured", extra={"error": str(exc)})
        return None


# ══════════════════════════════════════════════════════════════════════════
# ORDER GATING
# ══════════════════════════════════════════════════════════════════════════


async def check_order_allowed(shop_id: UUID) -> bool:
    """Check whether the shop can accept a new order right now.

    Compares ``orders_this_month`` against the plan's included limit plus
    any extra batches purchased this month.

    Args:
        shop_id: Shop UUID.

    Returns:
        True if an order can be placed, False if the limit is exhausted.
    """
    try:
        shop = await _get_shop(shop_id)
        if not shop:
            logger.warning("check_order_allowed: shop not found", extra={"shop_id": str(shop_id)})
            return True

        plan = shop.get("plan", "basic")
        limit = get_plan_limit(plan)
        orders_used = int(shop.get("orders_this_month", 0))
        extra_purchased = int(shop.get("extra_orders_purchased", 0))
        available = limit + extra_purchased

        allowed = orders_used < available
        if not allowed:
            logger.info(
                "Order limit reached for shop",
                extra={
                    "shop_id": str(shop_id),
                    "plan": plan,
                    "orders_used": orders_used,
                    "limit": limit,
                    "extra_purchased": extra_purchased,
                    "available": available,
                },
            )
        return allowed
    except Exception as exc:
        logger.error(
            "check_order_allowed failed",
            extra={"shop_id": str(shop_id), "error": str(exc)},
        )
        return True


async def increment_order_count(shop_id: UUID) -> None:
    """Increment the shop's monthly order counter by 1.

    Must be called after every successfully placed order.

    Args:
        shop_id: Shop UUID.
    """
    try:
        result = (
            await supabase.table("shops")
            .select("orders_this_month")
            .eq("id", str(shop_id))
            .maybe_single()
            .execute()
        )
        if not result.data:
            logger.warning("increment_order_count: shop not found", extra={"shop_id": str(shop_id)})
            return

        current = int(result.data.get("orders_this_month", 0))
        await (
            supabase.table("shops")
            .update({"orders_this_month": current + 1})
            .eq("id", str(shop_id))
            .execute()
        )
    except Exception as exc:
        logger.error(
            "increment_order_count failed",
            extra={"shop_id": str(shop_id), "error": str(exc)},
        )


# ══════════════════════════════════════════════════════════════════════════
# EXTRA ORDER BATCH PAYMENT
# ══════════════════════════════════════════════════════════════════════════


async def create_extra_order_batch_payment(shop_id: UUID, batch_size: int) -> dict[str, Any]:
    """Create a Razorpay order for an extra batch of orders.

    Args:
        shop_id: Shop UUID.
        batch_size: Number of extra orders to purchase (50, 100, or 200).

    Returns:
        Dict with keys:
          - razorpay_order_id: str
          - amount_paise: int
          - amount_rupees: float
          - batch_size: int
          - ledger_id: str

    Raises:
        ValueError: If batch_size is not valid or shop not found.
        RuntimeError: If Razorpay is not configured.
    """
    if batch_size not in VALID_BATCH_SIZES:
        raise ValueError(f"batch_size must be one of {VALID_BATCH_SIZES}, got {batch_size}")

    shop = await _get_shop(shop_id)
    if not shop:
        raise ValueError(f"Shop not found: {shop_id}")

    plan = shop.get("plan", "basic")
    rate = _get_plan_rate(plan)
    amount_rupees = int(batch_size * rate)
    amount_paise = amount_rupees * 100

    rc = _razorpay_client()
    if not rc:
        raise RuntimeError("Razorpay is not configured — cannot create payment")

    # Create Razorpay order
    receipt = f"extra_{shop_id}_{batch_size}_{datetime.now(timezone.utc).timestamp():.0f}"
    razorpay_order = await rc.create_order(
        amount_paise=amount_paise,
        receipt=receipt,
        notes={
            "shop_id": str(shop_id),
            "batch_size": str(batch_size),
            "type": "extra_order_batch",
        },
    )
    razorpay_order_id = razorpay_order.get("id", "")

    # Insert pending row in billing_ledger
    ledger_payload = {
        "shop_id": str(shop_id),
        "type": "extra_order_batch",
        "amount": float(amount_rupees),
        "orders_covered": batch_size,
        "razorpay_order_id": razorpay_order_id,
        "status": "pending",
    }
    ledger_result = await supabase.table("billing_ledger").insert(ledger_payload).execute()

    ledger_id = ""
    if ledger_result.data:
        ledger_id = str(ledger_result.data[0].get("id", ""))

    logger.info(
        "Extra order batch payment created",
        extra={
            "shop_id": str(shop_id),
            "batch_size": batch_size,
            "amount_rupees": amount_rupees,
            "razorpay_order_id": razorpay_order_id,
            "ledger_id": ledger_id,
        },
    )

    return {
        "razorpay_order_id": razorpay_order_id,
        "amount_paise": amount_paise,
        "amount_rupees": float(amount_rupees),
        "batch_size": batch_size,
        "ledger_id": ledger_id,
    }


async def confirm_extra_order_payment(
    razorpay_payment_id: str,
    razorpay_order_id: str,
) -> bool:
    """Confirm an extra-order-batch payment from the Razorpay webhook.

    Updates the billing_ledger row to 'paid', credits the extra orders
    to the shop, sets subscription_status to 'active', and sends a
    WhatsApp confirmation to the owner.

    Args:
        razorpay_payment_id: Razorpay payment ID.
        razorpay_order_id: Razorpay order ID.

    Returns:
        True if the payment was processed successfully.
    """
    try:
        # Find the billing_ledger row
        ledger_result = (
            await supabase.table("billing_ledger")
            .select("*")
            .eq("razorpay_order_id", razorpay_order_id)
            .maybe_single()
            .execute()
        )
        if not ledger_result.data:
            logger.error(
                "confirm_extra_order_payment: no ledger row found",
                extra={"razorpay_order_id": razorpay_order_id},
            )
            return False

        ledger = ledger_result.data
        if ledger.get("status") == "paid":
            logger.info(
                "confirm_extra_order_payment: already processed",
                extra={"razorpay_order_id": razorpay_order_id},
            )
            return True

        shop_id = UUID(ledger["shop_id"])
        batch_size = int(ledger["orders_covered"] or 0)

        # Update ledger row to paid
        await (
            supabase.table("billing_ledger")
            .update({
                "status": "paid",
                "razorpay_payment_id": razorpay_payment_id,
            })
            .eq("id", ledger["id"])
            .execute()
        )

        # Credit extra orders to shop
        shop_result = (
            await supabase.table("shops")
            .select("extra_orders_purchased, subscription_status, owner_whatsapp_number, access_token, phone_number_id")
            .eq("id", str(shop_id))
            .maybe_single()
            .execute()
        )
        if shop_result.data:
            current_extra = int(shop_result.data.get("extra_orders_purchased", 0))
            await (
                supabase.table("shops")
                .update({
                    "extra_orders_purchased": current_extra + batch_size,
                    "subscription_status": "active",
                })
                .eq("id", str(shop_id))
                .execute()
            )

        # Send WhatsApp confirmation
        await _send_payment_confirmation(shop_id, batch_size)

        logger.info(
            "Extra order payment confirmed",
            extra={
                "shop_id": str(shop_id),
                "batch_size": batch_size,
                "razorpay_payment_id": razorpay_payment_id,
                "razorpay_order_id": razorpay_order_id,
            },
        )
        return True
    except Exception as exc:
        logger.error(
            "confirm_extra_order_payment failed",
            extra={
                "razorpay_payment_id": razorpay_payment_id,
                "razorpay_order_id": razorpay_order_id,
                "error": str(exc),
            },
        )
        return False


async def _send_payment_confirmation(shop_id: UUID, batch_size: int) -> None:
    """Send a WhatsApp confirmation to the shop owner about a successful payment."""
    try:
        shop = await _get_shop(shop_id)
        if not shop:
            return

        owner_number = shop.get("owner_whatsapp_number", "")
        token = shop.get("access_token", "")
        phone_id = shop.get("phone_number_id", "")
        if not owner_number or not token or not phone_id:
            return

        client = WhatsAppClient(token, phone_id)
        msg = (
            f"✅ *Payment Successful!*\n\n"
            f"You have unlocked *{batch_size} extra orders*.\n"
            f"Your bot is now active and accepting orders again.\n\n"
            f"Thank you for your payment."
        )
        await client.send_message(owner_number, msg)
    except Exception as exc:
        logger.error(
            "Failed to send payment confirmation",
            extra={"shop_id": str(shop_id), "error": str(exc)},
        )


# ══════════════════════════════════════════════════════════════════════════
# PAUSE / RESUME
# ══════════════════════════════════════════════════════════════════════════


async def pause_shop(shop_id: UUID, reason: str) -> None:
    """Pause a shop's bot by setting subscription_status to 'paused'.

    Sends a WhatsApp notification to the owner with the reason.

    Args:
        shop_id: Shop UUID.
        reason: Human-readable reason for the pause.
    """
    try:
        shop = await _get_shop(shop_id)
        if not shop:
            return

        current_status = shop.get("subscription_status", "trial")
        if current_status == "paused":
            return

        await (
            supabase.table("shops")
            .update({"subscription_status": "paused"})
            .eq("id", str(shop_id))
            .execute()
        )

        owner_number = shop.get("owner_whatsapp_number", "")
        token = shop.get("access_token", "")
        phone_id = shop.get("phone_number_id", "")
        if owner_number and token and phone_id:
            client = WhatsAppClient(token, phone_id)
            msg = (
                f"⏸️ *Bot Paused*\n\n"
                f"Reason: {reason}\n\n"
                f"Your bot has been temporarily paused. "
                f"To resume, please purchase extra orders or upgrade your plan.\n"
                f"Contact support: {RECHARGE_CONTACT}"
            )
            await client.send_message(owner_number, msg)

        logger.info(
            "Shop paused",
            extra={"shop_id": str(shop_id), "reason": reason},
        )
    except Exception as exc:
        logger.error(
            "pause_shop failed",
            extra={"shop_id": str(shop_id), "reason": reason, "error": str(exc)},
        )


# ══════════════════════════════════════════════════════════════════════════
# MONTHLY BILLING CYCLE RESET
# ══════════════════════════════════════════════════════════════════════════


async def reset_monthly_counters() -> None:
    """APScheduler job — runs on the 1st of every month at 00:05 IST.

    For every shop with an active or trial subscription:
      1. Attempts to charge the monthly plan amount via Razorpay.
      2. On success: records a billing_ledger entry, resets
         orders_this_month and extra_orders_purchased to zero,
         sets subscription_status = 'active'.
      3. On failure: sets subscription_status = 'expired', sends
         WhatsApp notification to the owner with a recharge link.
    """
    logger.info("Starting monthly billing cycle reset...")

    try:
        shops_result = (
            await supabase.table("shops")
            .select("*")
            .in_("subscription_status", ["trial", "active"])
            .execute()
        )
        shops = shops_result.data or []
    except Exception as exc:
        logger.error("Failed to fetch shops for monthly reset", extra={"error": str(exc)})
        return

    if not shops:
        logger.info("No shops to process for monthly reset")
        return

    today = date.today()
    success_count = 0
    fail_count = 0

    for shop in shops:
        shop_id = shop["id"]
        plan = shop.get("plan", "basic")
        plan_price = _get_plan_price(plan)

        try:
            # Attempt to charge via Razorpay
            charge_success = await _attempt_monthly_charge(
                shop_id=shop_id,
                plan=plan,
                amount_rupees=plan_price,
                razorpay_subscription_id=shop.get("razorpay_subscription_id"),
            )

            if charge_success:
                # Reset counters and record billing
                await (
                    supabase.table("shops")
                    .update({
                        "orders_this_month": 0,
                        "extra_orders_purchased": 0,
                        "billing_cycle_start": today.isoformat(),
                        "subscription_status": "active",
                    })
                    .eq("id", str(shop_id))
                    .execute()
                )

                await supabase.table("billing_ledger").insert({
                    "shop_id": str(shop_id),
                    "type": "monthly_subscription",
                    "amount": float(plan_price),
                    "orders_covered": None,
                    "status": "paid",
                }).execute()

                logger.info(
                    "Monthly billing reset successful",
                    extra={"shop_id": str(shop_id), "plan": plan, "amount": plan_price},
                )
                success_count += 1
            else:
                # Mark as expired
                await (
                    supabase.table("shops")
                    .update({"subscription_status": "expired"})
                    .eq("id", str(shop_id))
                    .execute()
                )

                await _send_expiry_notification(shop)
                logger.warning(
                    "Monthly charge failed — shop expired",
                    extra={"shop_id": str(shop_id), "plan": plan},
                )
                fail_count += 1

        except Exception as exc:
            fail_count += 1
            logger.error(
                "Monthly reset error for shop",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )

    logger.info(
        "Monthly billing cycle reset complete",
        extra={"processed": len(shops), "success": success_count, "failed": fail_count},
    )


async def _attempt_monthly_charge(
    shop_id: UUID,
    plan: str,
    amount_rupees: int,
    razorpay_subscription_id: str | None,
) -> bool:
    """Attempt to charge the monthly plan amount via Razorpay.

    Returns True if the charge was successful (or if Razorpay is not
    configured — to allow fallback), False otherwise.
    """
    rc = _razorpay_client()
    if not rc:
        # Razorpay not configured — allow the reset to proceed
        logger.warning("Razorpay not configured — skipping monthly charge")
        return True

    try:
        if razorpay_subscription_id:
            # Check if the existing subscription is still active
            subscription = await asyncio.to_thread(
                rc._client.subscription.fetch, razorpay_subscription_id
            )
            sub_status = subscription.get("status", "")
            if sub_status == "active":
                return True
            elif sub_status == "completed":
                # Create a fresh subscription for the next billing cycle
                return await _create_razorpay_subscription(shop_id, plan)
            else:
                logger.warning(
                    "Subscription not active",
                    extra={
                        "shop_id": str(shop_id),
                        "subscription_id": razorpay_subscription_id,
                        "status": sub_status,
                    },
                )
                return False
        else:
            # No existing subscription — create a new one
            return await _create_razorpay_subscription(shop_id, plan)

    except Exception as exc:
        logger.error(
            "Monthly charge attempt failed",
            extra={"shop_id": str(shop_id), "error": str(exc)},
        )
        return False


async def _create_razorpay_subscription(shop_id: UUID, plan: str) -> bool:
    """Create a Razorpay subscription for the shop's plan.

    Returns True if the subscription was created successfully.
    """
    rc = _razorpay_client()
    if not rc:
        return False

    try:
        plan_price = _get_plan_price(plan)
        amount_paise = plan_price * 100

        # Create a subscription with a one-time upfront charge and
        # recurring monthly billing
        payload = {
            "plan_id": _get_or_create_plan_id(plan),
            "total_count": 12,
            "quantity": 1,
            "customer_notify": 1,
            "notes": {
                "shop_id": str(shop_id),
                "plan": plan,
            },
        }
        subscription = await asyncio.to_thread(
            rc._client.subscription.create, payload
        )
        subscription_id = subscription.get("id", "")

        if subscription_id:
            await (
                supabase.table("shops")
                .update({"razorpay_subscription_id": subscription_id})
                .eq("id", str(shop_id))
                .execute()
            )
            logger.info(
                "Razorpay subscription created",
                extra={
                    "shop_id": str(shop_id),
                    "subscription_id": subscription_id,
                },
            )
            return True

        return False
    except Exception as exc:
        logger.error(
            "Failed to create Razorpay subscription",
            extra={"shop_id": str(shop_id), "error": str(exc)},
        )
        return False


def _get_or_create_plan_id(plan: str) -> str:
    """Get the Razorpay plan ID for the given plan tier.

    In production this would fetch/create a plan via the Razorpay API.
    For now, we use a naming convention that the admin must set up
    plans with these IDs in the Razorpay dashboard:
      - basic   → plan_basic_monthly
      - standard → plan_standard_monthly
      - pro     → plan_pro_monthly
    """
    # Map plan names to Razorpay plan IDs (configured in dashboard)
    PLAN_ID_MAP = {
        "basic": "plan_basic_monthly",
        "standard": "plan_standard_monthly",
        "pro": "plan_pro_monthly",
    }
    return PLAN_ID_MAP.get(plan, PLAN_ID_MAP["basic"])


async def _send_expiry_notification(shop: dict[str, Any]) -> None:
    """Send an expiry WhatsApp notification to the shop owner."""
    try:
        owner_number = shop.get("owner_whatsapp_number", "")
        token = shop.get("access_token", "")
        phone_id = shop.get("phone_number_id", "")
        if not owner_number or not token or not phone_id:
            return

        client = WhatsAppClient(token, phone_id)
        msg = (
            f"❌ *Subscription Expired*\n\n"
            f"Your monthly plan payment could not be processed.\n"
            f"Your bot has been paused.\n\n"
            f"To reactivate, please recharge manually:\n"
            f"{RECHARGE_CONTACT}\n\n"
            f"Once payment is confirmed, your bot will resume automatically."
        )
        await client.send_message(owner_number, msg)
    except Exception as exc:
        logger.error(
            "Failed to send expiry notification",
            extra={"shop_id": str(shop.get("id")), "error": str(exc)},
        )


# ══════════════════════════════════════════════════════════════════════════
# SUBSCRIPTION WEBHOOK HANDLER
# ══════════════════════════════════════════════════════════════════════════


async def handle_subscription_charged(
    razorpay_payment_id: str,
    razorpay_subscription_id: str,
    amount_paise: int,
) -> bool:
    """Handle a successful subscription charge from the Razorpay webhook.

    Finds the shop by razorpay_subscription_id, records the payment in
    billing_ledger, and resets monthly counters.

    Args:
        razorpay_payment_id: Razorpay payment ID.
        razorpay_subscription_id: Razorpay subscription ID.
        amount_paise: Amount charged in paise.

    Returns:
        True if handled successfully.
    """
    try:
        shop_result = (
            await supabase.table("shops")
            .select("*")
            .eq("razorpay_subscription_id", razorpay_subscription_id)
            .maybe_single()
            .execute()
        )
        if not shop_result.data:
            logger.warning(
                "handle_subscription_charged: no shop found for subscription",
                extra={"razorpay_subscription_id": razorpay_subscription_id},
            )
            return False

        shop = shop_result.data
        shop_id = UUID(shop["id"])
        plan = shop.get("plan", "basic")
        amount_rupees = amount_paise / 100

        # Record in billing_ledger
        await supabase.table("billing_ledger").insert({
            "shop_id": str(shop_id),
            "type": "monthly_subscription",
            "amount": float(amount_rupees),
            "orders_covered": None,
            "razorpay_payment_id": razorpay_payment_id,
            "razorpay_order_id": razorpay_subscription_id,
            "status": "paid",
        }).execute()

        # Reset counters
        today = date.today()
        await (
            supabase.table("shops")
            .update({
                "orders_this_month": 0,
                "extra_orders_purchased": 0,
                "billing_cycle_start": today.isoformat(),
                "subscription_status": "active",
            })
            .eq("id", str(shop_id))
            .execute()
        )

        logger.info(
            "Subscription charge processed",
            extra={
                "shop_id": str(shop_id),
                "plan": plan,
                "amount": amount_rupees,
                "razorpay_payment_id": razorpay_payment_id,
            },
        )
        return True
    except Exception as exc:
        logger.error(
            "handle_subscription_charged failed",
            extra={
                "razorpay_subscription_id": razorpay_subscription_id,
                "error": str(exc),
            },
        )
        return False


# ══════════════════════════════════════════════════════════════════════════
# PLAN UPGRADE
# ══════════════════════════════════════════════════════════════════════════


async def update_shop_plan(shop_id: UUID, new_plan: str) -> bool:
    """Update a shop's plan.

    The plan change takes effect at the next billing cycle (counters
    are NOT reset immediately).

    Args:
        shop_id: Shop UUID.
        new_plan: One of 'basic', 'standard', 'pro'.

    Returns:
        True if updated successfully.
    """
    if new_plan not in PLAN_CONFIG:
        raise ValueError(f"Invalid plan: {new_plan}. Must be one of {list(PLAN_CONFIG.keys())}")

    try:
        await (
            supabase.table("shops")
            .update({"plan": new_plan})
            .eq("id", str(shop_id))
            .execute()
        )
        logger.info("Shop plan updated", extra={"shop_id": str(shop_id), "plan": new_plan})
        return True
    except Exception as exc:
        logger.error(
            "Failed to update shop plan",
            extra={"shop_id": str(shop_id), "plan": new_plan, "error": str(exc)},
        )
        return False


# ══════════════════════════════════════════════════════════════════════════
# BILLING HISTORY
# ══════════════════════════════════════════════════════════════════════════


async def get_billing_history(shop_id: UUID) -> list[dict[str, Any]]:
    """Return all billing_ledger rows for a shop, newest first.

    Args:
        shop_id: Shop UUID.

    Returns:
        List of billing_ledger dicts.
    """
    try:
        result = (
            await supabase.table("billing_ledger")
            .select("*")
            .eq("shop_id", str(shop_id))
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        logger.error(
            "Failed to fetch billing history",
            extra={"shop_id": str(shop_id), "error": str(exc)},
        )
        return []
