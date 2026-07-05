"""Service for managing orders."""

from __future__ import annotations

import random
import string
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

from app.database import supabase
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class OrderService:
    """CRUD and reporting operations for orders."""

    TABLE = "orders"

    @staticmethod
    def generate_order_code(shop_name: str) -> str:
        """Generate a unique order code: shop initials + 4 random digits.

        Args:
            shop_name: Name of the shop (e.g. "Sharma Kirana").

        Returns:
            Order code string (e.g. "SK1234").
        """
        words = shop_name.strip().split()
        if len(words) >= 2:
            initials = "".join(w[0] for w in words[:2]).upper()
        else:
            initials = (words[0][:2] if words else "SH").upper()
        digits = "".join(random.choices(string.digits, k=4))
        return f"{initials}{digits}"

    async def create(self, order_data: dict[str, Any]) -> dict[str, Any] | None:
        """Insert a new order into the database.

        Args:
            order_data: Order dict with all required fields.

        Returns:
            Created order dict or None on failure.
        """
        try:
            result = (
                supabase.table(self.TABLE).insert(order_data).execute()
            )
            logger.info(
                "Order created",
                extra={"order_code": order_data.get("order_code")},
            )
            return result.data[0] if result.data else None
        except Exception as exc:
            logger.error(
                "Failed to create order",
                extra={"error": str(exc), "order_code": order_data.get("order_code")},
            )
            return None

    async def get_by_code(self, order_code: str) -> dict[str, Any] | None:
        """Fetch an order by its unique code.

        Args:
            order_code: The order code (e.g. "SK1234").

        Returns:
            Order dict or None.
        """
        try:
            result = (
                supabase.table(self.TABLE)
                .select("*")
                .eq("order_code", order_code)
                .execute()
            )
            return result.data[0] if result.data else None
        except Exception as exc:
            logger.error(
                "Failed to fetch order by code",
                extra={"order_code": order_code, "error": str(exc)},
            )
            return None

    async def update_status(
        self, order_code: str, new_status: str
    ) -> bool:
        """Update the status of an order.

        Args:
            order_code: Order code to update.
            new_status: New status value (ACCEPTED, DELIVERED, CANCELLED).

        Returns:
            True if successful.
        """
        try:
            supabase.table(self.TABLE).update(
                {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}
            ).eq("order_code", order_code).execute()
            logger.info(
                "Order status updated",
                extra={"order_code": order_code, "status": new_status},
            )
            return True
        except Exception as exc:
            logger.error(
                "Failed to update order status",
                extra={
                    "order_code": order_code,
                    "status": new_status,
                    "error": str(exc),
                },
            )
            return False

    async def get_today_summary(
        self, shop_id: UUID
    ) -> dict[str, Any]:
        """Generate today's order summary for a shop.

        Args:
            shop_id: The shop's UUID.

        Returns:
            Dict with keys: count, total, top_item, pending.
        """
        today = date.today().isoformat()
        default: dict[str, Any] = {
            "count": 0,
            "total": 0.0,
            "top_item": "N/A",
            "pending": 0,
        }

        try:
            # All orders today
            result = (
                supabase.table(self.TABLE)
                .select("*")
                .eq("shop_id", str(shop_id))
                .gte("created_at", today)
                .execute()
            )
            orders = result.data

            if not orders:
                return default

            total_revenue = sum(float(o.get("total", 0)) for o in orders)
            pending_count = sum(
                1 for o in orders if o.get("status") == "PENDING"
            )

            # Find top item
            item_counts: dict[str, int] = {}
            for order in orders:
                items = order.get("items", [])
                for item in items:
                    name = item.get("name", "Unknown")
                    qty = int(item.get("quantity", 0))
                    item_counts[name] = item_counts.get(name, 0) + qty

            top_item = (
                max(item_counts, key=item_counts.get) if item_counts else "N/A"
            )

            return {
                "count": len(orders),
                "total": total_revenue,
                "top_item": top_item,
                "pending": pending_count,
            }
        except Exception as exc:
            logger.error(
                "Failed to generate today's summary",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )
            return default

    async def get_orders_by_status(
        self, shop_id: UUID, status: str
    ) -> list[dict[str, Any]]:
        """Fetch orders for a shop filtered by status.

        Args:
            shop_id: The shop's UUID.
            status: Order status to filter by.

        Returns:
            List of order dicts.
        """
        try:
            result = (
                supabase.table(self.TABLE)
                .select("*")
                .eq("shop_id", str(shop_id))
                .eq("status", status)
                .order("created_at", desc=True)
                .execute()
            )
            return result.data
        except Exception as exc:
            logger.error(
                "Failed to fetch orders by status",
                extra={
                    "shop_id": str(shop_id),
                    "status": status,
                    "error": str(exc),
                },
            )
            return []
