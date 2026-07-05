"""Kitchen notification service — sends orders to kitchen display and WhatsApp.

When a dine-in order is placed, the kitchen gets notified via:
1. WhatsApp message to the owner
2. Database insert into kitchen_orders (for the realtime dashboard)
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.database import supabase
from app.gateway.whatsapp_client import WhatsAppClient
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class KitchenService:
    """Kitchen order notification and management."""

    async def notify_kitchen_whatsapp(
        self,
        shop_id: UUID,
        order: dict[str, Any],
        client: WhatsAppClient,
        owner_number: str,
    ) -> None:
        """Send order details to the kitchen/owner via WhatsApp.

        Args:
            shop_id: Shop UUID.
            order: Order dict (from orders table).
            client: WhatsAppClient for sending.
            owner_number: Owner's WhatsApp number.
        """
        table_number = order.get("table_number", "N/A")
        customer = order.get("customer_number", "Unknown")
        order_code = order.get("order_code", "N/A")
        items = order.get("items", [])
        customizations = order.get("customizations", {}) or {}

        items_lines = []
        for item in items:
            name = item.get("name", "Item")
            qty = item.get("quantity", 1)
            items_lines.append(f"  • {name} x{qty}")

        items_text = "\n".join(items_lines)

        # Customizations
        cust_text = ""
        if customizations:
            cust_lines = [f"  • {k}: {v}" for k, v in customizations.items()]
            cust_text = "\n*Customizations:*\n" + "\n".join(cust_lines)

        message = (
            f"👨‍🍳 *New Kitchen Order!*\n\n"
            f"📋 Order: #{order_code}\n"
            f"🪑 Table: {table_number}\n"
            f"👤 Customer: {customer}\n\n"
            f"*Items:*\n{items_text}"
            f"{cust_text}"
        )

        await client.send_message(owner_number, message)
        logger.info(
            "Kitchen notified via WhatsApp",
            extra={"shop_id": str(shop_id), "order_code": order_code, "table": table_number},
        )

    async def notify_kitchen_dashboard(
        self,
        shop_id: UUID,
        order: dict[str, Any],
    ) -> bool:
        """Insert order into kitchen_orders table for realtime dashboard.

        Args:
            shop_id: Shop UUID.
            order: Order dict.

        Returns:
            True on success.
        """
        try:
            kitchen_entry = {
                "shop_id": str(shop_id),
                "order_id": str(order["id"]),
                "table_number": order.get("table_number"),
                "items": order.get("items", []),
                "customizations": order.get("customizations", {}),
                "status": "new",
            }

            result = (
                await supabase.table("kitchen_orders")
                .insert(kitchen_entry)
                .execute()
            )

            logger.info(
                "Kitchen order added to dashboard",
                extra={
                    "shop_id": str(shop_id),
                    "order_id": str(order.get("id")),
                    "table": order.get("table_number"),
                },
            )
            return bool(result.data)
        except Exception as exc:
            logger.error(
                "Failed to add kitchen order",
                extra={
                    "shop_id": str(shop_id),
                    "order_id": str(order.get("id")),
                    "error": str(exc),
                },
            )
            return False

    async def update_status(
        self, kitchen_order_id: UUID, status: str
    ) -> bool:
        """Update the status of a kitchen order.

        Statuses: new, preparing, ready, served

        Args:
            kitchen_order_id: Kitchen order UUID.
            status: New status value.

        Returns:
            True on success.
        """
        try:
            await (
                supabase.table("kitchen_orders")
                .update({"status": status})
                .eq("id", str(kitchen_order_id))
                .execute()
            )
            logger.info(
                "Kitchen order status updated",
                extra={"kitchen_order_id": str(kitchen_order_id), "status": status},
            )
            return True
        except Exception as exc:
            logger.error(
                "Failed to update kitchen order status",
                extra={
                    "kitchen_order_id": str(kitchen_order_id),
                    "status": status,
                    "error": str(exc),
                },
            )
            return False

    async def get_active_orders(self, shop_id: UUID) -> list[dict[str, Any]]:
        """Get all active kitchen orders (not served).

        Args:
            shop_id: Shop UUID.

        Returns:
            List of kitchen order dicts.
        """
        try:
            result = (
                await supabase.table("kitchen_orders")
                .select("*")
                .eq("shop_id", str(shop_id))
                .in_("status", ["new", "preparing", "ready"])
                .order("created_at")
                .execute()
            )
            return result.data or []
        except Exception as exc:
            logger.error(
                "Failed to fetch active kitchen orders",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )
            return []
