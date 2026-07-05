"""Unified message handler — state machine for all bot modes.

Modes:
  ordering  → Catalog → Add to Cart → Checkout → Order placed → Wallet check
  dine_in   → Table → Menu → Order → Kitchen notification → Bill
  salon     → Services → Staff → Date/Time → Appointment booked
  clinic    → Services → Date/Time → Appointment booked
  booking   → Asset → Date → Time slot → Advance payment → Booking confirmed
  appointment → Services → Staff → Date/Time → Appointment booked
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from app.database import supabase
from app.gateway.whatsapp_client import WhatsAppClient
from app.services.appointment_service import AppointmentService
from app.services.booking_service import BookingService
from app.services.dinein_service import DineInService
from app.services.kitchen_service import KitchenService
from app.services.billing_service import (
    check_order_allowed,
    create_extra_order_batch_payment,
    get_plan_limit,
    increment_order_count,
    pause_shop,
    update_shop_plan,
    PLAN_CONFIG,
)
from app.services.wallet_service import WalletService
from app.utils.bot_translations import get_text
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


# ── State machine states ─────────────────────────────────────────────────

class State:
    SELECTING_LANG = "SELECTING_LANG"
    AWAITING_NAME = "AWAITING_NAME"
    AWAITING_NUMBER = "AWAITING_NUMBER"
    MAIN_MENU = "MAIN_MENU"
    # Dine-in
    DINE_TABLE = "DINE_TABLE"
    # Catalog
    VIEWING_CATALOG = "VIEWING_CATALOG"
    VIEWING_CATEGORY = "VIEWING_CATEGORY"
    ADDING_TO_CART = "ADDING_TO_CART"
    VIEWING_CART = "VIEWING_CART"
    CHOOSING_QUANTITY = "CHOOSING_QUANTITY"
    AWAITING_ADDRESS = "AWAITING_ADDRESS"
    # Checkout
    ORDER_CONFIRMED = "ORDER_CONFIRMED"
    RATING = "RATING"
    # Salon/Clinic appointment
    SELECTING_SERVICE = "SELECTING_SERVICE"
    SELECTING_STAFF = "SELECTING_STAFF"
    SELECTING_DATE = "SELECTING_DATE"
    SELECTING_TIME = "SELECTING_TIME"
    APPOINTMENT_CONFIRMED = "APPOINTMENT_CONFIRMED"
    # Booking (turf/hotel)
    SELECTING_ASSET = "SELECTING_ASSET"
    BOOKING_DATE = "BOOKING_DATE"
    BOOKING_TIME = "BOOKING_TIME"
    BOOKING_CONFIRMED = "BOOKING_CONFIRMED"
    # Wallet / Account
    VIEWING_WALLET = "VIEWING_WALLET"

    # All states grouped by category for easy reference
    NON_INTERRUPTIBLE = {SELECTING_LANG, AWAITING_NAME, AWAITING_NUMBER}


# ── Conversation helpers ─────────────────────────────────────────────────


async def _get_conversation(wa_id: str) -> dict[str, Any] | None:
    """Get active conversation for a WhatsApp ID."""
    result = (
        await supabase.table("conversations")
        .select("*")
        .eq("wa_id", wa_id)
        .eq("active", True)
        .order("updated_at", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    return result.data if result else None


async def _create_or_update_conversation(
    wa_id: str,
    shop_id: UUID,
    state: str,
    state_data: dict[str, Any] | None = None,
    lang: str = "en",
    mode: str = "ordering",
    table_number: int | None = None,
) -> dict[str, Any]:
    """Create or update an active conversation."""
    existing = await _get_conversation(wa_id)
    payload = {
        "state": state,
        "state_data": state_data or {},
        "lang": lang,
        "mode": mode,
        "active": True,
        "shop_id": str(shop_id),
    }
    if table_number is not None:
        payload["table_number"] = table_number
    if existing:
        await (
            supabase.table("conversations")
            .update(payload)
            .eq("id", existing["id"])
            .execute()
        )
        return {**existing, **payload}
    else:
        payload["wa_id"] = wa_id
        result = (
            await supabase.table("conversations")
            .insert(payload)
            .execute()
        )
        return result.data[0] if result.data else payload


async def _end_conversation(wa_id: str) -> None:
    """Mark conversation as inactive."""
    existing = await _get_conversation(wa_id)
    if existing:
        await (
            supabase.table("conversations")
            .update({"active": False})
            .eq("id", existing["id"])
            .execute()
        )


async def _get_or_create_customer(
    wa_id: str, name: str = "", phone: str = ""
) -> dict[str, Any]:
    """Get or create a customer record."""
    result = (
        await supabase.table("customers")
        .select("*")
        .eq("wa_id", wa_id)
        .maybe_single()
        .execute()
    )
    if result.data:
        return result.data

    payload: dict[str, Any] = {"wa_id": wa_id}
    if name:
        payload["name"] = name
    if phone:
        payload["phone"] = phone

    insert_result = (
        await supabase.table("customers")
        .insert(payload)
        .execute()
    )
    return insert_result.data[0] if insert_result.data else payload


async def _get_shop(shop_id: UUID) -> dict[str, Any] | None:
    """Get shop by ID."""
    result = (
        await supabase.table("shops")
        .select("*")
        .eq("id", str(shop_id))
        .maybe_single()
        .execute()
    )
    return result.data


async def _get_shops_by_phone(phone_number_id: str) -> list[dict[str, Any]]:
    """Get shops matching a phone number ID."""
    result = (
        await supabase.table("shops")
        .select("*")
        .eq("phone_number_id", phone_number_id)
        .eq("active", True)
        .order("name")
        .execute()
    )
    return result.data or []


def _generate_order_code() -> str:
    """Generate a short order code."""
    import random
    import string
    chars = string.ascii_uppercase + string.digits
    return "ORD" + "".join(random.choices(chars, k=4))


# ── Main message handler ─────────────────────────────────────────────────


async def handle_message(
    wa_id: str,
    message: dict[str, Any],
    access_token: str,
    phone_number_id: str,
    shop_id: UUID | None = None,
) -> None:
    """Route an incoming WhatsApp message to the correct handler.

    Args:
        wa_id: WhatsApp ID (sender number).
        message: The message object from the webhook payload.
        access_token: Shop's WhatsApp access token.
        phone_number_id: Shop's phone number ID.
        shop_id: Pre-determined shop ID (if known from webhook routing).
    """
    client = WhatsAppClient(access_token, phone_number_id)

    msg_type = message.get("type", "")
    msg_text = ""
    interactive_id = ""
    interactive_title = ""

    # Extract text from different message types
    if msg_type == "text":
        msg_text = (message.get("text", {}) or {}).get("body", "").strip()
    elif msg_type == "interactive":
        interactive = message.get("interactive", {}) or {}
        if interactive.get("type") == "button_reply":
            interactive_id = (interactive.get("button_reply", {}) or {}).get("id", "")
            interactive_title = (interactive.get("button_reply", {}) or {}).get("title", "")
        elif interactive.get("type") == "list_reply":
            interactive_id = (interactive.get("list_reply", {}) or {}).get("id", "")
            interactive_title = (interactive.get("list_reply", {}) or {}).get("title", "")
        msg_text = interactive_title or msg_text
    elif msg_type in ("image", "document", "audio"):
        # Just acknowledge media types
        pass

    # ── Shop discovery ───────────────────────────────────────────────
    if not shop_id:
        shops = await _get_shops_by_phone(phone_number_id)
        if not shops:
            await client.send_message(
                wa_id,
                "⚠️ This bot is not configured for any active shop.\n"
                "Contact the shop owner to activate.",
            )
            return
        # Use the first matching shop
        shop = shops[0]
        shop_id = shop["id"]

    # ── Owner command routing (bypasses conversation state machine) ──
    owner_shop = await _get_shop(shop_id)
    is_owner = owner_shop and wa_id == owner_shop.get("owner_whatsapp_number", "")
    if is_owner:
        if interactive_id in ("BATCH_50", "BATCH_100", "BATCH_200"):
            await _handle_batch_payment(client, wa_id, shop_id, interactive_id)
            return
        if interactive_id in ("PLAN_BASIC", "PLAN_STANDARD", "PLAN_PRO"):
            await _handle_plan_upgrade(client, wa_id, shop_id, interactive_id)
            return
        # ── Owner order confirmation (WhatsApp Accept/Reject) ─────
        if interactive_id.startswith("ACCEPT_") or interactive_id.startswith("REJECT_") or msg_text.upper() in ("ACCEPT", "REJECT"):
            await _handle_owner_order_reply(client, wa_id, shop_id, msg_text, interactive_id, access_token, phone_number_id)
            return
        if msg_text.upper() in ("PLAN",):
            await _handle_plan_info(client, wa_id, shop_id)
            return
        if msg_text.upper() in ("UPGRADE",):
            await _handle_upgrade_options(client, wa_id, shop_id)
            return

    conv = await _get_conversation(wa_id)

    # ── Main menu entry point ────────────────────────────────────────
    if not conv:
        await _start_new_conversation(client, wa_id, shop_id, msg_text)
        return

    lang = conv.get("lang", "en")
    mode = conv.get("mode", "ordering")
    state_data = conv.get("state_data", {}) or {}

    table_number = conv.get("table_number")

    # ── State routing ────────────────────────────────────────────────
    state = conv.get("state", "")

    # Handle BACK / RESET
    if _is_back(msg_text, interactive_id):
        await _handle_back(client, wa_id, shop_id, conv, mode, lang)
        return
    if _is_reset(msg_text, interactive_id):
        await _end_conversation(wa_id)
        await _start_new_conversation(client, wa_id, shop_id, msg_text)
        return

    if state == State.SELECTING_LANG:
        await _handle_lang_select(client, wa_id, shop_id, msg_text, interactive_id)
    elif state == State.AWAITING_NAME:
        await _handle_name(client, wa_id, shop_id, msg_text, lang, mode)
    elif state == State.AWAITING_NUMBER:
        await _handle_phone(client, wa_id, shop_id, msg_text, lang, mode)
    elif state == State.MAIN_MENU:
        await _handle_main_menu(
            client, wa_id, shop_id, msg_text, interactive_id, lang, mode, table_number
        )
    elif state == State.VIEWING_CATALOG:
        await _handle_catalog(
            client, wa_id, shop_id, msg_text, interactive_id, lang, mode
        )
    elif state == State.VIEWING_CATEGORY:
        await _handle_category(
            client, wa_id, shop_id, msg_text, interactive_id, lang, state_data
        )
    elif state == State.CHOOSING_QUANTITY:
        await _handle_quantity(
            client, wa_id, shop_id, msg_text, interactive_id, lang, state_data
        )
    elif state == State.VIEWING_CART:
        await _handle_cart(
            client, wa_id, shop_id, msg_text, interactive_id, lang, state_data
        )
    elif state == State.AWAITING_ADDRESS:
        await _handle_address(
            client, wa_id, shop_id, msg_text, lang, state_data, access_token, phone_number_id
        )
    elif state == State.ORDER_CONFIRMED:
        await client.send_message(
            wa_id,
            get_text(lang, "menu_or_help"),
        )
    elif state == State.DINE_TABLE:
        await _handle_dine_table(
            client, wa_id, shop_id, msg_text, lang
        )
    elif state == State.SELECTING_SERVICE:
        await _handle_appt_service(
            client, wa_id, shop_id, msg_text, interactive_id, lang, mode
        )
    elif state == State.SELECTING_STAFF:
        await _handle_appt_staff(
            client, wa_id, shop_id, msg_text, interactive_id, lang, state_data
        )
    elif state == State.SELECTING_DATE:
        await _handle_appt_date(
            client, wa_id, shop_id, msg_text, interactive_id, lang, state_data
        )
    elif state == State.SELECTING_TIME:
        await _handle_appt_time(
            client, wa_id, shop_id, msg_text, interactive_id, lang, state_data, access_token, phone_number_id
        )
    elif state == State.SELECTING_ASSET:
        await _handle_booking_asset(
            client, wa_id, shop_id, msg_text, interactive_id, lang
        )
    elif state == State.BOOKING_DATE:
        await _handle_booking_date(
            client, wa_id, shop_id, msg_text, interactive_id, lang, state_data
        )
    elif state == State.BOOKING_TIME:
        await _handle_booking_time(
            client, wa_id, shop_id, msg_text, interactive_id, lang, state_data, access_token, phone_number_id
        )
    elif state == State.VIEWING_WALLET:
        await _handle_wallet_check(
            client, wa_id, lang, state_data
        )
    elif state == State.RATING:
        await _handle_rating(
            client, wa_id, msg_text, interactive_id, lang, state_data
        )
    else:
        # Unknown state — reset
        await _end_conversation(wa_id)
        await _start_new_conversation(client, wa_id, shop_id, msg_text)


# ── Owner order reply handler ──────────────────────────────────────────


async def _handle_owner_order_reply(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    interactive_id: str,
    access_token: str,
    phone_number_id: str,
) -> None:
    """Handle owner's Accept/Reject reply on an order notification.

    When the owner taps Accept or Reject on the order notification,
    this updates the order status and notifies the customer.
    """
    order_id: str | None = None
    is_accepted = False

    if interactive_id.startswith("ACCEPT_"):
        order_id = interactive_id.replace("ACCEPT_", "")
        is_accepted = True
    elif interactive_id.startswith("REJECT_"):
        order_id = interactive_id.replace("REJECT_", "")
        is_accepted = False
    elif msg_text.upper() == "ACCEPT":
        is_accepted = True
    elif msg_text.upper() == "REJECT":
        is_accepted = False
    else:
        await client.send_message(wa_id, "Please reply ACCEPT or REJECT to confirm the order.")
        return

    if not order_id:
        try:
            result = (
                await supabase.table("orders")
                .select("id, order_code")
                .eq("shop_id", str(shop_id))
                .eq("status", "PLACED")
                .order("created_at", desc=True)
                .limit(1)
                .maybe_single()
                .execute()
            )
            if result and result.data:
                order_id = str(result.data["id"])
        except Exception as exc:
            logger.error(
                "Failed to find pending order",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )

    if not order_id:
        await client.send_message(wa_id, "No pending order found to confirm.")
        return

    new_status = "ACCEPTED" if is_accepted else "CANCELLED"
    try:
        await (
            supabase.table("orders")
            .update({"status": new_status})
            .eq("id", order_id)
            .execute()
        )
    except Exception as exc:
        logger.error(
            "Failed to update order status",
            extra={"order_id": order_id, "status": new_status, "error": str(exc)},
        )
        await client.send_message(wa_id, "Failed to update order. Please try again.")
        return

    try:
        order_result = (
            await supabase.table("orders")
            .select("order_code, customer_number")
            .eq("id", order_id)
            .maybe_single()
            .execute()
        )
        order_code = order_result.data.get("order_code", "") if order_result and order_result.data else ""
        customer_number = order_result.data.get("customer_number", "") if order_result and order_result.data else ""
    except Exception:
        order_code = ""
        customer_number = ""

    if is_accepted:
        await client.send_message(
            wa_id,
            f"✅ *Order {order_code} Accepted!*\n"
            f"The customer has been notified. Preparing order...",
        )

        if customer_number:
            await client.send_message(
                customer_number,
                f"✅ *Order #{order_code} Confirmed!*\n"
                f"Your order has been accepted by the shop and is being prepared.\n\n"
                f"Thank you for your patience! 🙏",
            )
    else:
        await client.send_message(
            wa_id,
            f"❌ *Order {order_code} Rejected.*\n"
            f"The customer has been notified.",
        )

        if customer_number:
            await client.send_message(
                customer_number,
                f"❌ *Order #{order_code} Declined*\n"
                f"Sorry, the shop has declined your order. This may be due to "
                f"unavailability of items or other reasons.\n\n"
                f"Please contact the shop directly if you have questions.",
            )


# ── New conversation start ───────────────────────────────────────────────


async def _start_new_conversation(
    client: WhatsAppClient, wa_id: str, shop_id: UUID, msg_text: str
) -> None:
    """Start a new conversation — greet and select language."""
    shop = await _get_shop(shop_id)
    shop_name = shop.get("name", "Store") if shop else "Store"

    # Check if we can detect language from message
    lang = "en"
    detected_lang = _detect_lang(msg_text)
    if detected_lang:
        lang = detected_lang

    await _create_or_update_conversation(
        wa_id, shop_id, State.AWAITING_NAME, lang=lang
    )

    await client.send_message(
        wa_id,
        f"👋 *Welcome to {shop_name}!* / *{shop_name} mein aapka swagat hai!*\n\n"
        f"Please share your name:\n"
        f"Kripya apna naam batayein:",
    )


# ── Language helper ──────────────────────────────────────────────────────


def _detect_lang(text: str) -> str:
    """Basic language detection from user's first message."""
    if not text:
        return "en"
    hi_indicators = ["नमस्ते", "नमस्कार", "हाँ", "हां", "ना", "नहीं", "है", "हूं"]
    for ind in hi_indicators:
        if ind in text:
            return "hi"
    return "en"


def _is_back(text: str, interactive_id: str) -> bool:
    return text.upper() in ("BACK", "B", "←", "⬅") or interactive_id == "BACK"


def _is_reset(text: str, interactive_id: str) -> bool:
    return text.upper() in ("MENU", "RESET", "MAIN MENU") or interactive_id == "RESET"


# ── State handlers ───────────────────────────────────────────────────────


async def _handle_lang_select(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    interactive_id: str,
) -> None:
    """Language selection handler."""
    lang = interactive_id if interactive_id in ("en", "hi") else (
        "hi" if msg_text.upper() in ("HINDI", "HI", "हिंदी", "हिन्दी") else "en"
    )

    await _create_or_update_conversation(
        wa_id, shop_id, State.MAIN_MENU, lang=lang
    )

    await _show_main_menu(client, wa_id, shop_id, lang, "ordering")


async def _handle_name(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    lang: str,
    mode: str,
) -> None:
    """Name collection handler."""
    if not msg_text or len(msg_text) < 2:
        await client.send_message(
            wa_id, get_text(lang, "invalid_name")
        )
        return

    name = msg_text.strip().title()

    await _get_or_create_customer(wa_id, name=name)
    await _create_or_update_conversation(
        wa_id, shop_id, State.AWAITING_NUMBER,
        state_data={"customer_name": name}, lang=lang,
    )

    await client.send_message(
        wa_id, f"{get_text(lang, 'ask_name')} *{name}*!\n\n{get_text(lang, 'ask_phone')}"
    )


async def _handle_phone(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    lang: str,
    mode: str,
) -> None:
    """Phone number collection handler."""
    phone = re.sub(r"[^0-9]", "", msg_text) if msg_text else ""
    state_data: dict[str, Any] = {}

    if phone and len(phone) >= 10:
        await _get_or_create_customer(wa_id, phone=phone)
        state_data["customer_phone"] = phone

    await _create_or_update_conversation(
        wa_id, shop_id, State.MAIN_MENU,
        state_data=state_data, lang=lang,
    )

    await _show_main_menu(client, wa_id, shop_id, lang, mode)


async def _show_main_menu(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    lang: str,
    mode: str,
) -> None:
    """Display the main menu based on shop mode."""
    shop = await _get_shop(shop_id)
    shop_name = shop.get("name", "Store") if shop else "Store"

    if mode in ("salon", "clinic", "appointment"):
        msg = f"🏥 *{shop_name}*\n\n{get_text(lang, 'menu_appointment')}"
        buttons = [
            {"id": "BOOK_APPT", "title": get_text(lang, "btn_book_appt")},
            {"id": "MY_APPOINTMENTS", "title": get_text(lang, "btn_my_appts")},
        ]
    elif mode in ("booking",):
        msg = f"🏟️ *{shop_name}*\n\n{get_text(lang, 'menu_booking')}"
        buttons = [
            {"id": "BOOK_ASSET", "title": get_text(lang, "btn_book_asset")},
            {"id": "MY_BOOKINGS", "title": get_text(lang, "btn_my_bookings")},
        ]
    elif mode in ("dine_in",):
        msg = f"🍽️ *{shop_name}*\n\n{get_text(lang, 'menu_dine_in')}"
        buttons = [
            {"id": "VIEW_MENU", "title": get_text(lang, "btn_view_menu")},
            {"id": "BILL", "title": get_text(lang, "btn_bill")},
        ]
    else:
        # Default ordering mode
        msg = f"🛒 *{shop_name}*\n\n{get_text(lang, 'menu_ordering')}"
        buttons = [
            {"id": "VIEW_MENU", "title": get_text(lang, "btn_view_menu")},
            {"id": "MY_ORDERS", "title": get_text(lang, "btn_my_orders")},
            {"id": "WALLET", "title": get_text(lang, "btn_wallet")},
        ]

    buttons.append({"id": "HELP", "title": get_text(lang, "btn_help")})

    await client.send_buttons(wa_id, msg, buttons)


async def _handle_main_menu(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    interactive_id: str,
    lang: str,
    mode: str,
    table_number: int | None,
) -> None:
    """Route from main menu based on selection."""
    action = interactive_id or msg_text.upper().strip()

    # ── Ordering mode actions ─────────────────────────────────────
    if action in ("VIEW_MENU", "VIEW CATALOG", "MENU", "ORDER"):
        await _enter_catalog(client, wa_id, shop_id, lang)
    elif action in ("MY_ORDERS", "ORDERS", "HISTORY"):
        await _send_order_history(client, wa_id, shop_id, lang)

    # ── Dine-in mode actions ──────────────────────────────────────
    elif mode == "dine_in" and action in ("BILL",):
        await _handle_dine_bill(
            client, wa_id, shop_id, lang, table_number, access_token="", phone_number_id=""
        )
    elif mode == "dine_in" and action in ("VIEW_MENU", "MENU"):
        await _enter_catalog(client, wa_id, shop_id, lang)

    # ── Appointment mode actions ──────────────────────────────────
    elif mode in ("salon", "clinic", "appointment") and action in ("BOOK_APPT", "BOOK APPOINTMENT"):
        await _enter_appointment_services(client, wa_id, shop_id, lang)
    elif mode in ("salon", "clinic", "appointment") and action in ("MY_APPOINTMENTS", "APPOINTMENTS"):
        await _send_appointments(client, wa_id, shop_id, lang)

    # ── Booking mode actions ──────────────────────────────────────
    elif mode in ("booking",) and action in ("BOOK_ASSET", "BOOK"):
        await _enter_booking_assets(client, wa_id, shop_id, lang)
    elif mode in ("booking",) and action in ("MY_BOOKINGS", "BOOKINGS"):
        await _send_bookings(client, wa_id, shop_id, lang)

    # ── Common actions ────────────────────────────────────────────
    elif action in ("WALLET", "BALANCE"):
        await _check_wallet(client, wa_id, shop_id, lang)
    elif action in ("HELP",):
        await _send_help(client, wa_id, lang, mode)
    else:
        await client.send_message(
            wa_id, get_text(lang, "invalid_option")
        )


# ══════════════════════════════════════════════════════════════════════════
# ORDERING FLOW — Catalog, Cart, Checkout
# ══════════════════════════════════════════════════════════════════════════


async def _enter_catalog(
    client: WhatsAppClient, wa_id: str, shop_id: UUID, lang: str
) -> None:
    """Show categories and featured products."""
    try:
        # Get categories
        cats_result = (
            await supabase.table("products")
            .select("category")
            .eq("shop_id", str(shop_id))
            .eq("available", True)
            .execute()
        )
        categories = sorted(set(
            p.get("category", "Uncategorized")
            for p in (cats_result.data or [])
            if p.get("category")
        ))

        await _create_or_update_conversation(
            wa_id, shop_id, State.VIEWING_CATALOG, lang=lang,
        )

        if categories:
            msg = get_text(lang, "choose_category")
            sections = [
                {
                    "title": get_text(lang, "categories"),
                    "rows": [
                        {"id": f"C_{cat}", "title": cat}
                        for cat in categories
                    ],
                }
            ]
            await client.send_list(wa_id, msg, get_text(lang, "btn_categories"), sections)
        else:
            # No categories, show all products
            await _show_products_in_category(
                client, wa_id, shop_id, lang, category=None
            )

    except Exception as exc:
        logger.error("Catalog entry failed", extra={"shop_id": str(shop_id), "error": str(exc)})
        await client.send_message(wa_id, get_text(lang, "error_occurred"))


async def _handle_catalog(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    interactive_id: str,
    lang: str,
    mode: str,
) -> None:
    """Handle category selection from catalog."""
    cat_id = interactive_id if interactive_id.startswith("C_") else ""
    category = ""
    if cat_id:
        category = cat_id[2:]
    elif msg_text:
        category = msg_text.strip()

    if not category:
        await _enter_catalog(client, wa_id, shop_id, lang)
        return

    await _show_products_in_category(client, wa_id, shop_id, lang, category)


PRODUCTS_PER_PAGE = 9


async def _show_products_in_category(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    lang: str,
    category: str | None,
    page: int = 0,
) -> None:
    """Show products in a category (or all if category is None)."""
    try:
        query = (
            supabase.table("products")
            .select("*")
            .eq("shop_id", str(shop_id))
            .eq("available", True)
        )
        if category:
            query = query.eq("category", category)

        result = await query.order("name").execute()
        products = result.data or []

        if not products:
            await client.send_message(wa_id, get_text(lang, "no_products"))
            return

        total_products = len(products)
        max_page = max(0, (total_products - 1) // PRODUCTS_PER_PAGE) if total_products > 0 else 0
        page = max(0, min(page, max_page))

        state_data = {"category": category, "page": page}
        await _create_or_update_conversation(
            wa_id, shop_id, State.VIEWING_CATEGORY,
            state_data=state_data, lang=lang,
        )

        # Build paginated product rows
        start = page * PRODUCTS_PER_PAGE
        end = start + PRODUCTS_PER_PAGE
        page_products = products[start:end]

        rows = []
        for p in page_products:
            price = float(p.get("price", 0))
            desc = p.get("description", "") or ""
            rows.append({
                "id": f"P_{p['id']}",
                "title": p.get("name", "Item")[:24],
                "description": f"₹{price:.0f} {desc[:20]}",
            })

        # Add pagination rows
        if page > 0:
            rows.append({"id": "PAGE_PREV", "title": "⬅️ Prev"})
        if end < total_products:
            rows.append({"id": "PAGE_NEXT", "title": "Next ➡️"})

        section_title = category or get_text(lang, "all_products")
        if total_products > PRODUCTS_PER_PAGE:
            section_title += f" ({page + 1}/{max_page + 1})"

        sections = [{"title": section_title, "rows": rows}]
        await client.send_list(
            wa_id,
            get_text(lang, "choose_product"),
            get_text(lang, "btn_products"),
            sections,
        )

    except Exception as exc:
        logger.error("Show products failed", extra={"shop_id": str(shop_id), "error": str(exc)})
        await client.send_message(wa_id, get_text(lang, "error_occurred"))


async def _handle_category(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    interactive_id: str,
    lang: str,
    state_data: dict[str, Any],
) -> None:
    """Handle product selection from category."""
    if interactive_id in ("PAGE_NEXT", "PAGE_PREV"):
        page = state_data.get("page", 0)
        page = page + 1 if interactive_id == "PAGE_NEXT" else page - 1
        await _show_products_in_category(
            client, wa_id, shop_id, lang,
            state_data.get("category"), page=page,
        )
        return

    product_id = ""
    if interactive_id.startswith("P_"):
        product_id = interactive_id[2:]
    elif msg_text:
        # Try to find product by name
        try:
            result = (
                await supabase.table("products")
                .select("*")
                .eq("shop_id", str(shop_id))
                .eq("name", msg_text.strip())
                .eq("available", True)
                .maybe_single()
                .execute()
            )
            if result.data:
                product_id = result.data["id"]
        except Exception:
            pass

    if not product_id:
        await client.send_message(wa_id, get_text(lang, "product_not_found"))
        return

    # Get product details
    result = (
        await supabase.table("products")
        .select("*")
        .eq("id", product_id)
        .maybe_single()
        .execute()
    )
    product = result.data
    if not product:
        await client.send_message(wa_id, get_text(lang, "product_not_found"))
        return

    price = float(product.get("price", 0))
    name = product.get("name", "Item")
    desc = product.get("description", "")
    has_variants = bool(product.get("variants"))

    state_data["selected_product_id"] = product_id
    state_data["selected_product_name"] = name
    state_data["selected_product_price"] = price
    state_data["product_description"] = desc
    state_data["has_variants"] = has_variants

    if has_variants:
        variants = product.get("variants", {})
        variant_options = variants.get("options", [])
        state_data["variant_options"] = variant_options
        state_data["variant_group"] = variants.get("group", "Option")

    await _create_or_update_conversation(
        wa_id, shop_id, State.CHOOSING_QUANTITY,
        state_data=state_data, lang=lang,
    )

    msg = f"*{name}*\n💰 ₹{price:.0f}"
    if desc:
        msg += f"\n\n{desc}"

    if has_variants:
        msg += f"\n\n*{state_data.get('variant_group', 'Option')}:*"
        for i, opt in enumerate(state_data.get("variant_options", []), 1):
            msg += f"\n{i}. {opt.get('name', opt) if isinstance(opt, dict) else opt} +₹{opt.get('price', 0) if isinstance(opt, dict) else 0}"

    msg += f"\n\n{get_text(lang, 'ask_quantity')}"

    qty_rows = [{"id": f"QTY_{i}", "title": str(i)} for i in range(1, 11)]
    qty_rows.append({"id": "QTY_MORE", "title": get_text(lang, "qty_more")})
    await client.send_list(
        wa_id,
        msg,
        get_text(lang, "btn_select_qty"),
        [{"title": "Quantity", "rows": qty_rows}],
    )


async def _handle_quantity(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    interactive_id: str,
    lang: str,
    state_data: dict[str, Any],
) -> None:
    """Handle quantity entry, then add to cart."""
    # Parse quantity from interactive_id (list tap) or text
    quantity = 1
    variant_selection = None

    if interactive_id and interactive_id.startswith("QTY_"):
        qty_str = interactive_id.replace("QTY_", "")
        if qty_str == "MORE":
            await client.send_message(
                wa_id,
                f"*{state_data.get('selected_product_name', 'Item')}*\n"
                f"Please type the exact quantity you want (e.g., *15*):",
            )
            return
        quantity = int(qty_str)
        if state_data.get("temp_quantity") is not None:
            state_data.pop("temp_quantity", None)
    elif msg_text:
        qty_match = re.match(r"^(\d+)(?:\s+(.+))?$", msg_text.strip())
        if qty_match:
            quantity = int(qty_match.group(1))
            if qty_match.group(2):
                variant_selection = qty_match.group(2)
        elif state_data.get("temp_quantity") is not None:
            # Follow-up message with variant name only
            quantity = state_data["temp_quantity"]
            variant_selection = msg_text.strip()

    # If variants exist and no selection yet, ask for variant
    if state_data.get("has_variants") and not variant_selection:
        state_data["temp_quantity"] = quantity
        await _create_or_update_conversation(
            wa_id, shop_id, State.CHOOSING_QUANTITY,
            state_data=state_data, lang=lang,
        )
        await client.send_message(
            wa_id,
            f"Please select a {state_data.get('variant_group', 'Option')}:\n"
            f"Reply with the option name, e.g.: *Chocolate*",
        )
        return

    state_data.pop("temp_quantity", None)

    quantity = max(1, min(quantity, 99))
    price = state_data.get("selected_product_price", 0)
    total = quantity * price

    # Add to cart in state_data
    cart = state_data.get("cart", [])
    cart_item = {
        "product_id": state_data.get("selected_product_id"),
        "name": state_data.get("selected_product_name"),
        "quantity": quantity,
        "price": price,
        "total": total,
        "variant": variant_selection,
    }
    cart.append(cart_item)
    state_data["cart"] = cart

    await _create_or_update_conversation(
        wa_id, shop_id, State.VIEWING_CART,
        state_data=state_data, lang=lang,
    )

    await client.send_buttons(
        wa_id,
        f"✅ Added: *{cart_item['name']}* x{quantity} = ₹{total:.0f}\n"
        f"{get_text(lang, 'cart_continue')}",
        [
            {"id": "VIEW_CART", "title": get_text(lang, "btn_view_cart")},
            {"id": "CONTINUE_SHOPPING", "title": get_text(lang, "btn_continue")},
            {"id": "CHECKOUT", "title": get_text(lang, "btn_checkout")},
        ],
    )


async def _handle_cart(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    interactive_id: str,
    lang: str,
    state_data: dict[str, Any],
) -> None:
    """Handle cart actions."""
    action = interactive_id or msg_text.upper().strip()

    if action in ("VIEW_CART", "CART", "SHOW"):
        cart = state_data.get("cart", [])
        if not cart:
            await client.send_message(wa_id, get_text(lang, "cart_empty"))
            return

        lines = [f"🛒 *{get_text(lang, 'your_cart')}*", ""]
        grand_total = 0
        for item in cart:
            t = item.get("total", 0)
            lines.append(f"• {item['name']} x{item['quantity']} = ₹{t:.0f}")
            grand_total += t
        lines.extend(["", f"*Total: ₹{grand_total:.0f}*"])

        await client.send_buttons(
            wa_id,
            "\n".join(lines),
            [
                {"id": "CONTINUE_SHOPPING", "title": get_text(lang, "btn_continue")},
                {"id": "CHECKOUT", "title": get_text(lang, "btn_checkout")},
                {"id": "CLEAR_CART", "title": get_text(lang, "btn_clear_cart")},
            ],
        )
        return

    if action in ("CONTINUE_SHOPPING", "MORE", "ADD MORE"):
        await _enter_catalog(client, wa_id, shop_id, lang)
        return

    if action in ("CLEAR_CART", "CLEAR", "EMPTY"):
        state_data["cart"] = []
        await _create_or_update_conversation(
            wa_id, shop_id, State.VIEWING_CART,
            state_data=state_data, lang=lang,
        )
        await client.send_message(wa_id, get_text(lang, "cart_cleared"))
        return

    if action in ("CHECKOUT", "ORDER", "DONE"):
        await _begin_checkout(client, wa_id, shop_id, lang, state_data)
        return

    await client.send_message(wa_id, get_text(lang, "invalid_option"))


async def _begin_checkout(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    lang: str,
    state_data: dict[str, Any],
) -> None:
    """Start checkout — ask for delivery address."""
    if not state_data.get("cart"):
        await client.send_message(wa_id, get_text(lang, "cart_empty"))
        return

    await _create_or_update_conversation(
        wa_id, shop_id, State.AWAITING_ADDRESS,
        state_data=state_data, lang=lang,
    )

    await client.send_message(wa_id, get_text(lang, "ask_address"))


async def _handle_address(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    lang: str,
    state_data: dict[str, Any],
    access_token: str,
    phone_number_id: str,
) -> None:
    """Handle delivery address, create order."""
    if not msg_text or len(msg_text) < 5:
        await client.send_message(wa_id, get_text(lang, "invalid_address"))
        return

    address = msg_text.strip()
    state_data["delivery_address"] = address

    # Create the order
    order_code = _generate_order_code()
    cart = state_data.get("cart", [])
    grand_total = sum(item.get("total", 0) for item in cart)
    customer_name = state_data.get("customer_name", "Customer")
    customer_phone = state_data.get("customer_phone", wa_id)

    # Get shop's owner number
    shop = await _get_shop(shop_id)
    owner_number = shop.get("owner_whatsapp_number", "") if shop else ""

    # ── Billing check: order limit gate ──────────────────────────────
    if not await check_order_allowed(shop_id):
        await client.send_message(
            wa_id,
            "🚫 *Order Limit Reached*\n\n"
            "The shop has reached its monthly order limit and is "
            "temporarily not accepting new orders.\n\n"
            "Please contact the shop owner or try again later.",
        )
        if owner_number:
            await client.send_buttons(
                owner_number,
                "📊 *Order Limit Reached*\n\n"
                "Your bot has been paused because it reached the "
                "monthly order limit. Buy extra orders to resume:",
                [
                    {"id": "BATCH_50", "title": "50 extra orders"},
                    {"id": "BATCH_100", "title": "100 extra orders"},
                    {"id": "BATCH_200", "title": "200 extra orders"},
                ],
            )
        await pause_shop(shop_id, "Monthly order limit reached")
        return

    try:
        order_payload = {
            "shop_id": str(shop_id),
            "wa_id": wa_id,
            "order_code": order_code,
            "customer_name": customer_name,
            "customer_number": wa_id,
            "customer_phone": customer_phone,
            "items": cart,
            "total_amount": float(grand_total),
            "delivery_address": address,
            "status": "PLACED",
            "payment_status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "table_number": state_data.get("table_number"),
        }

        result = (
            await supabase.table("orders")
            .insert(order_payload)
            .execute()
        )
        order_id = result.data[0]["id"] if result.data else None

        # ── Wallet check (per-order deduction) ─────────────────────
        if order_id:
            wallet = WalletService()
            can_proceed = await wallet.check_and_deduct_order(shop_id, order_id)
            if not can_proceed:
                await client.send_message(
                    wa_id,
                    get_text(lang, "shop_paused"),
                )
                return

        # ── Billing: increment monthly order counter ────────────────
        if order_id:
            await increment_order_count(shop_id)

        # ── Kitchen notification (for dine-in) ─────────────────────
        if state_data.get("table_number") and order_id:
            kitchen = KitchenService()
            notify_order = {**order_payload, "id": order_id}
            await kitchen.notify_kitchen_dashboard(shop_id, notify_order)
            if owner_number:
                await kitchen.notify_kitchen_whatsapp(
                    shop_id,
                    notify_order,
                    client,
                    owner_number,
                )

        # ── Notify shop owner (with Accept/Reject buttons) ─────────
        if owner_number:
            items_text = "\n".join(
                f"  • {i['name']} x{i['quantity']}"
                for i in cart
            )
            order_id_str = str(order_id) if order_id else ""
            accept_id = f"ACCEPT_{order_id_str}" if order_id_str else "ACCEPT"
            reject_id = f"REJECT_{order_id_str}" if order_id_str else "REJECT"
            await client.send_buttons(
                owner_number,
                f"🆕 *New Order!*\n"
                f"Order: #{order_code}\n"
                f"Customer: {customer_name} ({wa_id})\n"
                f"Items:\n{items_text}\n"
                f"Total: ₹{grand_total:.0f}\n"
                f"Address: {address}",
                [
                    {"id": accept_id, "title": "✅ Accept"},
                    {"id": reject_id, "title": "❌ Reject"},
                ],
            )

        # ── Confirm to customer ────────────────────────────────────
        await _create_or_update_conversation(
            wa_id, shop_id, State.ORDER_CONFIRMED,
            state_data={"last_order_code": order_code, "order_id": order_id},
            lang=lang,
        )

        await client.send_message(
            wa_id,
            get_text(lang, "order_placed").format(order_code=order_code),
        )

        await client.send_list(
            wa_id,
            get_text(lang, "ask_rating"),
            get_text(lang, "btn_rate"),
            [{
                "title": "Rating",
                "rows": [
                    {"id": "RATING_5", "title": "⭐⭐⭐⭐⭐"},
                    {"id": "RATING_4", "title": "⭐⭐⭐⭐"},
                    {"id": "RATING_3", "title": "⭐⭐⭐"},
                    {"id": "RATING_2", "title": "⭐⭐"},
                    {"id": "RATING_1", "title": "⭐"},
                ],
            }],
        )
        await _create_or_update_conversation(
            wa_id, shop_id, State.RATING,
            state_data={"last_order_code": order_code, "order_id": order_id},
            lang=lang,
        )

    except Exception as exc:
        logger.error(
            "Order creation failed",
            extra={"shop_id": str(shop_id), "wa_id": wa_id, "error": str(exc)},
        )
        await client.send_message(wa_id, get_text(lang, "error_occurred"))


async def _handle_rating(
    client: WhatsAppClient,
    wa_id: str,
    msg_text: str,
    interactive_id: str,
    lang: str,
    state_data: dict[str, Any],
) -> None:
    """Handle customer rating."""
    rating = 5
    if interactive_id.startswith("RATING_"):
        rating = int(interactive_id.replace("RATING_", ""))
    elif msg_text and msg_text.strip().isdigit():
        rating = int(msg_text.strip())

    order_id = state_data.get("order_id")
    if order_id:
        try:
            await (
                supabase.table("orders")
                .update({"rating": rating})
                .eq("id", order_id)
                .execute()
            )
        except Exception:
            pass

    await client.send_message(wa_id, get_text(lang, "thank_you"))


# ══════════════════════════════════════════════════════════════════════════
# DINE-IN FLOW
# ══════════════════════════════════════════════════════════════════════════


async def _handle_dine_table(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    lang: str,
) -> None:
    """Handle table number from QR code scan."""
    dine_in = DineInService()
    table_number = dine_in.detect_table_from_message(msg_text)

    if not table_number:
        await client.send_message(wa_id, get_text(lang, "invalid_table"))
        return

    # Verify table exists
    table = await dine_in.get_table(shop_id, table_number)
    if not table:
        await client.send_message(
            wa_id,
            f"Table {table_number} not found. Please check your table number."
        )
        return

    await _create_or_update_conversation(
        wa_id, shop_id, State.MAIN_MENU,
        state_data={"table_number": table_number, "customer_name": "Guest"},
        lang=lang, mode="dine_in", table_number=table_number,
    )

    await _show_main_menu(client, wa_id, shop_id, lang, "dine_in")


async def _handle_dine_bill(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    lang: str,
    table_number: int | None,
    access_token: str,
    phone_number_id: str,
) -> None:
    """Send bill for a dine-in table."""
    if not table_number:
        await client.send_message(wa_id, get_text(lang, "invalid_table"))
        return

    shop = await _get_shop(shop_id)
    owner_number = shop.get("owner_whatsapp_number", "") if shop else ""

    dine_in = DineInService()
    await dine_in.send_bill(shop_id, table_number, client, owner_number)


# ══════════════════════════════════════════════════════════════════════════
# APPOINTMENT FLOW (Salon/Clinic)
# ══════════════════════════════════════════════════════════════════════════


async def _enter_appointment_services(
    client: WhatsAppClient, wa_id: str, shop_id: UUID, lang: str
) -> None:
    """Show available services for booking."""
    appt = AppointmentService()
    services = await appt.get_services(shop_id)

    if not services:
        await client.send_message(wa_id, get_text(lang, "no_services"))
        return

    await _create_or_update_conversation(
        wa_id, shop_id, State.SELECTING_SERVICE, lang=lang,
    )

    rows = [
        {
            "id": f"S_{s['id']}",
            "title": s.get("name", "Service")[:24],
            "description": f"₹{float(s.get('price', 0)):.0f}",
        }
        for s in services
    ]
    await client.send_list(
        wa_id,
        get_text(lang, "choose_service"),
        get_text(lang, "btn_services"),
        [{"title": get_text(lang, "services"), "rows": rows}],
    )


async def _handle_appt_service(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    interactive_id: str,
    lang: str,
    mode: str,
) -> None:
    """Handle service selection for appointment."""
    service_id = ""
    if interactive_id.startswith("S_"):
        service_id = interactive_id[2:]

    if not service_id:
        await client.send_message(wa_id, get_text(lang, "service_not_found"))
        return

    # Get service details
    result = (
        await supabase.table("products")
        .select("*")
        .eq("id", service_id)
        .maybe_single()
        .execute()
    )
    service = result.data
    if not service:
        await client.send_message(wa_id, get_text(lang, "service_not_found"))
        return

    state_data = {
        "service_id": service_id,
        "service_name": service.get("name", "Service"),
        "service_price": float(service.get("price", 0)),
    }

    appt = AppointmentService()
    staff = await appt.get_staff(shop_id)

    if staff:
        # Show staff selection
        await _create_or_update_conversation(
            wa_id, shop_id, State.SELECTING_STAFF,
            state_data=state_data, lang=lang,
        )

        rows = [
            {
                "id": f"ST_{s['id']}",
                "title": s.get("name", "Staff")[:24],
            }
            for s in staff
        ]
        await client.send_list(
            wa_id,
            get_text(lang, "choose_staff"),
            get_text(lang, "btn_staff"),
            [{"title": get_text(lang, "staff"), "rows": rows}],
        )
    else:
        # Skip to date selection
        await _ask_appointment_date(client, wa_id, shop_id, lang, state_data)


async def _handle_appt_staff(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    interactive_id: str,
    lang: str,
    state_data: dict[str, Any],
) -> None:
    """Handle staff selection for appointment."""
    staff_id = ""
    if interactive_id.startswith("ST_"):
        staff_id = interactive_id[2:]

    if staff_id:
        state_data["staff_id"] = staff_id

    await _ask_appointment_date(client, wa_id, shop_id, lang, state_data)


async def _ask_appointment_date(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    lang: str,
    state_data: dict[str, Any],
) -> None:
    """Ask customer for appointment date via date list."""
    await _create_or_update_conversation(
        wa_id, shop_id, State.SELECTING_DATE,
        state_data=state_data, lang=lang,
    )

    today = date.today()
    date_rows = [
        {
            "id": f"DATE_{(today + timedelta(days=i)).isoformat()}",
            "title": (today + timedelta(days=i)).strftime("%b %d")[:24],
            "description": (today + timedelta(days=i)).strftime("%A"),
        }
        for i in range(1, 8)
    ]
    await client.send_list(
        wa_id,
        get_text(lang, "ask_date"),
        get_text(lang, "btn_select_date"),
        [{"title": "Available Dates", "rows": date_rows}],
    )


async def _handle_appt_date(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    interactive_id: str,
    lang: str,
    state_data: dict[str, Any],
) -> None:
    """Handle date selection for appointment."""
    parsed_date = None
    if interactive_id and interactive_id.startswith("DATE_"):
        try:
            parsed_date = date.fromisoformat(interactive_id.replace("DATE_", ""))
        except ValueError:
            pass
    if not parsed_date:
        parsed_date = _parse_date(msg_text) if msg_text else None
    if not parsed_date:
        await client.send_message(
            wa_id,
            f"{get_text(lang, 'invalid_date')}\n"
            f"Example: *2025-01-15*",
        )
        return

    # Check date is in future
    today = date.today()
    if parsed_date <= today:
        await client.send_message(wa_id, get_text(lang, "date_past"))
        return

    state_data["appointment_date"] = parsed_date.isoformat()
    await _create_or_update_conversation(
        wa_id, shop_id, State.SELECTING_TIME,
        state_data=state_data, lang=lang,
    )

    await client.send_message(
        wa_id,
        f"{get_text(lang, 'ask_time')} (e.g., *10:00*)",
    )


async def _handle_appt_time(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    interactive_id: str,
    lang: str,
    state_data: dict[str, Any],
    access_token: str,
    phone_number_id: str,
) -> None:
    """Handle time slot selection and confirm appointment."""
    time_slot = interactive_id
    if not time_slot or not time_slot.startswith("T_"):
        time_slot = msg_text.strip() if msg_text else ""

    # Validate time format
    time_match = re.match(r"^(\d{1,2}):(\d{2})$", time_slot)
    if not time_match:
        await client.send_message(
            wa_id,
            f"{get_text(lang, 'invalid_time')}\n"
            f"Example: *10:00*",
        )
        return

    state_data["time_slot"] = time_slot

    # Book appointment
    appt = AppointmentService()
    appt_date = date.fromisoformat(state_data["appointment_date"])
    staff_id = state_data.get("staff_id")

    booking = await appt.book_appointment(
        shop_id=shop_id,
        customer_number=wa_id,
        service_name=state_data["service_name"],
        service_price=state_data["service_price"],
        appointment_date=appt_date,
        time_slot=time_slot,
        staff_id=UUID(staff_id) if staff_id else None,
    )

    if booking:
        await _create_or_update_conversation(
            wa_id, shop_id, State.APPOINTMENT_CONFIRMED,
            state_data={"appointment_id": str(booking.get("id", ""))},
            lang=lang,
        )

        msg = (
            f"✅ *{get_text(lang, 'appointment_confirmed')}*\n\n"
            f"📋 {get_text(lang, 'service')}: {state_data['service_name']}\n"
            f"📅 {get_text(lang, 'date')}: {state_data['appointment_date']}\n"
            f"⏰ {get_text(lang, 'time')}: {time_slot}\n"
            f"💰 {get_text(lang, 'price')}: ₹{state_data['service_price']:.0f}\n\n"
            f"{get_text(lang, 'thank_you')}"
        )
        await client.send_message(wa_id, msg)

        # Notify owner
        shop = await _get_shop(shop_id)
        owner_number = shop.get("owner_whatsapp_number", "") if shop else ""
        if owner_number:
            await client.send_message(
                owner_number,
                f"🆕 *New Appointment!*\n\n"
                f"Service: {state_data['service_name']}\n"
                f"Date: {state_data['appointment_date']}\n"
                f"Time: {time_slot}\n"
                f"Customer: {wa_id}",
            )
    else:
        await client.send_message(wa_id, get_text(lang, "booking_failed"))


# ══════════════════════════════════════════════════════════════════════════
# BOOKING FLOW (Turf / Hotel / Venue)
# ══════════════════════════════════════════════════════════════════════════


async def _enter_booking_assets(
    client: WhatsAppClient, wa_id: str, shop_id: UUID, lang: str
) -> None:
    """Show bookable assets."""
    booking_svc = BookingService()
    assets = await booking_svc.get_assets(shop_id)

    if not assets:
        await client.send_message(wa_id, get_text(lang, "no_assets"))
        return

    await _create_or_update_conversation(
        wa_id, shop_id, State.SELECTING_ASSET, lang=lang,
    )

    rows = [
        {
            "id": f"A_{a['id']}",
            "title": a.get("name", "Asset")[:24],
            "description": f"₹{float(a.get('price', 0)):.0f}/slot",
        }
        for a in assets
    ]
    await client.send_list(
        wa_id,
        get_text(lang, "choose_asset"),
        get_text(lang, "btn_assets"),
        [{"title": get_text(lang, "assets"), "rows": rows}],
    )


async def _handle_booking_asset(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    interactive_id: str,
    lang: str,
) -> None:
    """Handle asset selection."""
    asset_id = ""
    if interactive_id.startswith("A_"):
        asset_id = interactive_id[2:]

    if not asset_id:
        await client.send_message(wa_id, get_text(lang, "asset_not_found"))
        return

    booking_svc = BookingService()
    asset = await booking_svc.get_asset(UUID(asset_id))
    if not asset:
        await client.send_message(wa_id, get_text(lang, "asset_not_found"))
        return

    state_data = {
        "asset_id": asset_id,
        "asset_name": asset.get("name", "Asset"),
        "asset_price": float(asset.get("price", 0)),
        "asset_type": asset.get("type", "venue"),
    }

    await _create_or_update_conversation(
        wa_id, shop_id, State.BOOKING_DATE,
        state_data=state_data, lang=lang,
    )

    today = date.today()
    date_rows = [
        {
            "id": f"DATE_{(today + timedelta(days=i)).isoformat()}",
            "title": (today + timedelta(days=i)).strftime("%b %d")[:24],
            "description": (today + timedelta(days=i)).strftime("%A"),
        }
        for i in range(1, 8)
    ]
    body = (
        f"*{get_text(lang, 'asset')}:* {state_data['asset_name']}\n"
        f"💰 ₹{state_data['asset_price']:.0f}/slot\n\n"
        f"{get_text(lang, 'ask_date')}"
    )
    await client.send_list(
        wa_id,
        body,
        get_text(lang, "btn_select_date"),
        [{"title": "Available Dates", "rows": date_rows}],
    )


async def _handle_booking_date(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    interactive_id: str,
    lang: str,
    state_data: dict[str, Any],
) -> None:
    """Handle booking date selection."""
    parsed_date = None
    if interactive_id and interactive_id.startswith("DATE_"):
        try:
            parsed_date = date.fromisoformat(interactive_id.replace("DATE_", ""))
        except ValueError:
            pass
    if not parsed_date:
        parsed_date = _parse_date(msg_text) if msg_text else None
    if not parsed_date:
        await client.send_message(
            wa_id,
            f"{get_text(lang, 'invalid_date')}\n"
            f"Example: *2025-01-15*",
        )
        return

    if parsed_date <= date.today():
        await client.send_message(wa_id, get_text(lang, "date_past"))
        return

    state_data["booking_date"] = parsed_date.isoformat()
    await _create_or_update_conversation(
        wa_id, shop_id, State.BOOKING_TIME,
        state_data=state_data, lang=lang,
    )

    await client.send_message(
        wa_id,
        f"{get_text(lang, 'ask_time')} (e.g., *10:00*)",
    )


async def _handle_booking_time(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    msg_text: str,
    interactive_id: str,
    lang: str,
    state_data: dict[str, Any],
    access_token: str,
    phone_number_id: str,
) -> None:
    """Handle booking time and confirm."""
    time_str = msg_text.strip() if msg_text else ""

    time_match = re.match(r"^(\d{1,2}):(\d{2})$", time_str)
    if not time_match:
        await client.send_message(
            wa_id,
            f"{get_text(lang, 'invalid_time')}\n"
            f"Example: *10:00*",
        )
        return

    start_time = time_str
    # Default 1 hour slot
    h, m = int(time_match.group(1)), int(time_match.group(2))
    end_h = h + 1
    end_time = f"{end_h:02d}:{m:02d}"

    state_data["start_time"] = start_time
    state_data["end_time"] = end_time

    booking_svc = BookingService()
    booking_date = date.fromisoformat(state_data["booking_date"])

    booking = await booking_svc.create_booking(
        shop_id=shop_id,
        asset_id=UUID(state_data["asset_id"]),
        customer_number=wa_id,
        customer_name=state_data.get("customer_name", "Customer"),
        booking_date=booking_date,
        start_time=start_time,
        end_time=end_time,
        total_amount=state_data["asset_price"],
        advance_paid=0.0,
    )

    if booking:
        booking_code = booking.get("booking_code", "N/A")
        await _create_or_update_conversation(
            wa_id, shop_id, State.BOOKING_CONFIRMED,
            state_data={"booking_code": booking_code},
            lang=lang,
        )

        msg = (
            f"✅ *{get_text(lang, 'booking_confirmed')}*\n\n"
            f"📍 {get_text(lang, 'asset')}: {state_data['asset_name']}\n"
            f"📅 {get_text(lang, 'date')}: {state_data['booking_date']}\n"
            f"⏰ {get_text(lang, 'time')}: {start_time} - {end_time}\n"
            f"🔑 Code: {booking_code}\n\n"
            f"{get_text(lang, 'thank_you')}"
        )
        await client.send_message(wa_id, msg)

        # Notify owner
        shop = await _get_shop(shop_id)
        owner_number = shop.get("owner_whatsapp_number", "") if shop else ""
        if owner_number:
            await client.send_message(
                owner_number,
                f"🆕 *New Booking!*\n\n"
                f"📍 {state_data['asset_name']}\n"
                f"📅 {state_data['booking_date']}\n"
                f"⏰ {start_time} - {end_time}\n"
                f"👤 Customer: {wa_id}\n"
                f"🔑 Code: {booking_code}",
            )
    else:
        await client.send_message(wa_id, get_text(lang, "booking_failed"))


# ══════════════════════════════════════════════════════════════════════════
# WALLET / ACCOUNT
# ══════════════════════════════════════════════════════════════════════════


async def _check_wallet(
    client: WhatsAppClient, wa_id: str, shop_id: UUID, lang: str
) -> None:
    """Send wallet balance to the customer (or owner)."""
    wallet = WalletService()
    balance = await wallet.get_balance(shop_id)

    msg = (
        f"💰 *{get_text(lang, 'your_wallet')}*\n\n"
        f"Balance: ₹{float(balance):.0f}\n\n"
        f"{get_text(lang, 'wallet_info')}"
    )
    await client.send_message(wa_id, msg)


async def _handle_wallet_check(
    client: WhatsAppClient, wa_id: str, lang: str, state_data: dict[str, Any]
) -> None:
    """Handle wallet-related actions."""
    await client.send_message(wa_id, get_text(lang, "wallet_info"))


# ══════════════════════════════════════════════════════════════════════════
# ORDER HISTORY / APPOINTMENTS / BOOKINGS
# ══════════════════════════════════════════════════════════════════════════


async def _send_order_history(
    client: WhatsAppClient, wa_id: str, shop_id: UUID, lang: str
) -> None:
    """Send recent order history."""
    try:
        result = (
            await supabase.table("orders")
            .select("*")
            .eq("shop_id", str(shop_id))
            .eq("wa_id", wa_id)
            .order("created_at", desc=True)
            .limit(5)
            .execute()
        )
        orders = result.data or []
        if not orders:
            await client.send_message(wa_id, get_text(lang, "no_orders"))
            return

        lines = [f"📋 *{get_text(lang, 'your_orders')}*", ""]
        for o in orders:
            items_summary = ", ".join(
                f"{i.get('name', 'Item')} x{i.get('quantity', 1)}"
                for i in (o.get("items", []) or [])
            )
            lines.append(
                f"#{o.get('order_code', 'N/A')} — ₹{float(o.get('total_amount', 0)):.0f}\n"
                f"   {items_summary}\n"
                f"   Status: {o.get('status', 'UNKNOWN')}"
            )
            lines.append("")

        await client.send_message(wa_id, "\n".join(lines))
    except Exception as exc:
        logger.error("Order history failed", extra={"wa_id": wa_id, "error": str(exc)})
        await client.send_message(wa_id, get_text(lang, "error_occurred"))


async def _send_appointments(
    client: WhatsAppClient, wa_id: str, shop_id: UUID, lang: str
) -> None:
    """Send upcoming appointments."""
    appt = AppointmentService()
    appointments = await appt.get_daily_appointments(shop_id)

    if not appointments:
        await client.send_message(wa_id, get_text(lang, "no_appointments"))
        return

    lines = [f"📅 *{get_text(lang, 'your_appointments')}*", ""]
    for a in appointments:
        lines.append(
            f"• {a.get('service_name', 'Service')}\n"
            f"  {a.get('appointment_date', '')} @ {a.get('time_slot', '')}\n"
            f"  Status: {a.get('status', '')}"
        )

    await client.send_message(wa_id, "\n".join(lines))


async def _send_bookings(
    client: WhatsAppClient, wa_id: str, shop_id: UUID, lang: str
) -> None:
    """Send bookings for a customer."""
    booking_svc = BookingService()
    bookings = await booking_svc.get_bookings(shop_id)

    if not bookings:
        await client.send_message(wa_id, get_text(lang, "no_bookings"))
        return

    lines = [f"📍 *{get_text(lang, 'your_bookings')}*", ""]
    for b in bookings:
        lines.append(
            f"• {b.get('customer_name', 'Customer')}\n"
            f"  {b.get('booking_date', '')} @ {b.get('start_time', '')}\n"
            f"  Code: {b.get('booking_code', 'N/A')}\n"
            f"  Status: {b.get('status', '')}"
        )

    await client.send_message(wa_id, "\n".join(lines))


# ══════════════════════════════════════════════════════════════════════════
# BACK / HELP
# ══════════════════════════════════════════════════════════════════════════


async def _handle_back(
    client: WhatsAppClient,
    wa_id: str,
    shop_id: UUID,
    conv: dict[str, Any],
    mode: str,
    lang: str,
) -> None:
    """Go back to main menu."""
    await _create_or_update_conversation(
        wa_id, shop_id, State.MAIN_MENU,
        state_data=conv.get("state_data", {}),
        lang=lang, mode=mode,
    )
    await _show_main_menu(client, wa_id, shop_id, lang, mode)


async def _send_help(
    client: WhatsAppClient, wa_id: str, lang: str, mode: str
) -> None:
    """Send help message."""
    help_texts = {
        "ordering": (
            "🛒 *How to Order:*\n"
            "1. View Menu — Browse products\n"
            "2. Select items and quantity\n"
            "3. Enter delivery address\n"
            "4. Confirm and order\n\n"
            "Keywords: BACK to go back, MENU to restart"
        ),
        "dine_in": (
            "🍽️ *Dine-in Help:*\n"
            "1. Scan QR code on your table\n"
            "2. Browse the menu\n"
            "3. Order items\n"
            "4. Ask for bill when done\n\n"
            "Type BACK to go back."
        ),
        "salon": (
            "💇 *Appointment Help:*\n"
            "1. Select a service\n"
            "2. Choose staff (optional)\n"
            "3. Pick date and time\n"
            "4. Confirm appointment\n\n"
            "Type BACK to go back."
        ),
        "booking": (
            "🏟️ *Booking Help:*\n"
            "1. Choose a venue/asset\n"
            "2. Select date and time\n"
            "3. Confirm booking\n\n"
            "Type BACK to go back."
        ),
    }
    msg = help_texts.get(mode, help_texts["ordering"])
    await client.send_message(wa_id, msg)


# ══════════════════════════════════════════════════════════════════════════
# UTILITY
# ══════════════════════════════════════════════════════════════════════════


def _parse_date(text: str) -> date | None:
    """Try to parse a date from user input."""
    text = text.strip()
    # Try ISO format: 2025-01-15
    try:
        return date.fromisoformat(text)
    except ValueError:
        pass

    # Try DD-MM-YYYY or DD/MM/YYYY
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%d %m %Y", "%d %b", "%d %B"):
        try:
            parsed = datetime.strptime(text, fmt).date()
            if len(text.split()) <= 2 and fmt in ("%d %b", "%d %B"):
                # If only day+month, assume current year
                parsed = parsed.replace(year=date.today().year)
            return parsed
        except ValueError:
            continue

    return None


# ══════════════════════════════════════════════════════════════════════════
# OWNER COMMANDS (billing / plan / upgrade)
# ══════════════════════════════════════════════════════════════════════════


async def _handle_plan_info(
    client: WhatsAppClient, wa_id: str, shop_id: UUID
) -> None:
    """Send shop owner their current plan and usage info."""
    try:
        shop = await _get_shop(shop_id)
        if not shop:
            await client.send_message(wa_id, "Shop not found.")
            return

        plan = shop.get("plan", "basic")
        plan_limit = get_plan_limit(plan)
        orders_used = int(shop.get("orders_this_month", 0))
        extra_purchased = int(shop.get("extra_orders_purchased", 0))
        available = plan_limit + extra_purchased
        status = shop.get("subscription_status", "trial")
        price = PLAN_CONFIG.get(plan, {}).get("price", 0)

        msg = (
            f"📊 *Your Plan: {plan.upper()}*\n\n"
            f"💰 Price: ₹{price}/month\n"
            f"📦 Included orders: {plan_limit}/month\n"
            f"➕ Extra orders purchased: {extra_purchased}\n"
            f"✅ Orders used this month: {orders_used}\n"
            f"📈 Orders available: {available - orders_used}\n"
            f"🔵 Status: {status.upper()}\n\n"
            f"Upgrade anytime with the \"upgrade\" command."
        )
        await client.send_message(wa_id, msg)
    except Exception as exc:
        logger.error("_handle_plan_info failed", extra={"shop_id": str(shop_id), "error": str(exc)})
        await client.send_message(wa_id, "Could not fetch plan info. Please try again.")


async def _handle_upgrade_options(
    client: WhatsAppClient, wa_id: str, shop_id: UUID
) -> None:
    """Send plan upgrade buttons to the shop owner."""
    try:
        shop = await _get_shop(shop_id)
        current_plan = shop.get("plan", "basic") if shop else "basic"

        await client.send_buttons(
            wa_id,
            f"⬆️ *Upgrade Plan*\n\n"
            f"Your current plan: *{current_plan.upper()}*\n\n"
            f"Choose a new plan:",
            [
                {"id": "PLAN_BASIC", "title": "Basic ₹299"},
                {"id": "PLAN_STANDARD", "title": "Standard ₹499"},
                {"id": "PLAN_PRO", "title": "Pro ₹799"},
            ],
        )
    except Exception as exc:
        logger.error(
            "_handle_upgrade_options failed",
            extra={"shop_id": str(shop_id), "error": str(exc)},
        )
        await client.send_message(wa_id, "Could not show upgrade options. Please try again.")


async def _handle_plan_upgrade(
    client: WhatsAppClient, wa_id: str, shop_id: UUID, interactive_id: str
) -> None:
    """Handle a plan upgrade button click."""
    plan_map = {
        "PLAN_BASIC": "basic",
        "PLAN_STANDARD": "standard",
        "PLAN_PRO": "pro",
    }
    new_plan = plan_map.get(interactive_id, "")
    if not new_plan:
        await client.send_message(wa_id, "Invalid plan selection.")
        return

    success = await update_shop_plan(shop_id, new_plan)
    if success:
        price = PLAN_CONFIG.get(new_plan, {}).get("price", 0)
        limit = get_plan_limit(new_plan)
        await client.send_message(
            wa_id,
            f"✅ *Plan Upgraded to {new_plan.upper()}!*\n\n"
            f"New plan: *{new_plan.upper()}*\n"
            f"Price: ₹{price}/month\n"
            f"Included orders: {limit}/month\n\n"
            f"The new plan will take effect from your next billing cycle.\n"
            f"Use the \"plan\" command to view your updated plan details.",
        )
    else:
        await client.send_message(
            wa_id, "❌ Could not update plan. Please try again or contact support."
        )


async def _handle_batch_payment(
    client: WhatsAppClient, wa_id: str, shop_id: UUID, interactive_id: str
) -> None:
    """Handle a batch size button click — create Razorpay order and send payment link."""
    batch_sizes = {
        "BATCH_50": 50,
        "BATCH_100": 100,
        "BATCH_200": 200,
    }
    batch_size = batch_sizes.get(interactive_id, 0)
    if not batch_size:
        await client.send_message(wa_id, "Invalid batch selection.")
        return

    try:
        result = await create_extra_order_batch_payment(shop_id, batch_size)
        razorpay_order_id = result["razorpay_order_id"]
        amount_rupees = result["amount_rupees"]

        # Build Razorpay payment link URL
        # The owner pays via Razorpay checkout — we send the order ID
        # so they can complete payment on the Razorpay hosted page.
        payment_url = (
            f"https://rzp.io/i/{razorpay_order_id}"
        )

        await client.send_message(
            wa_id,
            f"💳 *Extra Orders Purchase*\n\n"
            f"Batch: *{batch_size} extra orders*\n"
            f"Amount: *₹{amount_rupees:.0f}*\n\n"
            f"Pay via Razorpay:\n{payment_url}\n\n"
            f"Once payment is confirmed, your bot will resume automatically.",
        )

        logger.info(
            "Batch payment link sent to owner",
            extra={
                "shop_id": str(shop_id),
                "batch_size": batch_size,
                "razorpay_order_id": razorpay_order_id,
            },
        )
    except ValueError as exc:
        await client.send_message(wa_id, f"❌ {exc}")
    except RuntimeError as exc:
        await client.send_message(
            wa_id,
            "❌ Payment system is not configured yet. Please contact support.",
        )
        logger.error(
            "Batch payment failed — Razorpay not configured",
            extra={"shop_id": str(shop_id), "batch_size": batch_size},
        )
    except Exception as exc:
        logger.error(
            "Batch payment creation failed",
            extra={"shop_id": str(shop_id), "batch_size": batch_size, "error": str(exc)},
        )
        await client.send_message(
            wa_id,
            "❌ An error occurred while creating the payment. Please try again or contact support.",
        )
