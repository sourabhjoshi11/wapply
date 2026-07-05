"""Service for formatting and sending notifications to customers and owners."""

from __future__ import annotations

from typing import Any

from app.gateway.whatsapp_client import WhatsAppClient
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class NotificationService:
    """Handles notification formatting and delivery via WhatsApp."""

    def __init__(
        self,
        access_token: str,
        phone_number_id: str,
        owner_number: str,
        shop_name: str,
    ) -> None:
        self.client = WhatsAppClient(access_token, phone_number_id)
        self.owner_number = owner_number
        self.shop_name = shop_name

    async def new_order_to_owner(self, order: dict[str, Any]) -> None:
        """Notify the shop owner about a new order.

        Args:
            order: The order dict with items, total, address, etc.
        """
        items_lines = []
        for item in order.get("items", []):
            name = item.get("name", "Unknown")
            qty = item.get("quantity", 1)
            price = float(item.get("price", 0))
            items_lines.append(f"• {name} x{qty} = Rs {price * qty:.0f}")

        items_text = "\n".join(items_lines)
        total = float(order.get("total", 0))
        address = order.get("address", "Not provided")
        payment = order.get("payment_method", "Not specified")
        order_code = order.get("order_code", "N/A")
        customer = order.get("customer_number", "Unknown")

        message = (
            f"🛍️ *New Order #{order_code}*\n"
            f"Customer: {customer}\n\n"
            f"*Items:*\n{items_text}\n\n"
            f"*Total:* Rs {total:.0f}\n"
            f"*Address:* {address}\n"
            f"*Payment:* {payment}\n\n"
            f"Reply *accept {order_code}* to confirm\n"
            f"Reply *cancel {order_code}* to cancel"
        )

        await self.client.send_message(self.owner_number, message)

    async def order_accepted(self, order: dict[str, Any]) -> None:
        """Notify customer that their order was accepted.

        Args:
            order: The order dict.
        """
        order_code = order.get("order_code", "N/A")
        message = (
            f"✅ *Your order #{order_code} is confirmed!*\n\n"
            "Estimated delivery: 30-45 mins 🚚\n\n"
            "Thank you for ordering with us! 😊"
        )
        await self.client.send_message(order["customer_number"], message)

    async def order_delivered(self, order: dict[str, Any]) -> None:
        """Notify customer that their order was delivered.

        Args:
            order: The order dict.
        """
        order_code = order.get("order_code", "N/A")
        message = (
            f"✅ *Order #{order_code} has been delivered!*\n\n"
            "Thank you for your order. We hope you enjoyed it! 😊\n"
            "Please visit us again."
        )
        await self.client.send_message(order["customer_number"], message)

    async def order_cancelled(self, order: dict[str, Any]) -> None:
        """Notify customer that their order was cancelled.

        Args:
            order: The order dict.
        """
        order_code = order.get("order_code", "N/A")
        message = (
            f"❌ *Sorry, order #{order_code} was cancelled.*\n\n"
            "Please contact the shop for more info.\n"
            "We apologize for the inconvenience. 🙏"
        )
        await self.client.send_message(order["customer_number"], message)

    async def send_daily_summary(
        self, summary: dict[str, Any]
    ) -> None:
        """Send daily order summary to the shop owner.

        Args:
            summary: Dict with count, total, top_item, pending keys.
        """
        message = (
            f"📊 *Today's Summary - {self.shop_name}*\n"
            f"Orders: {summary['count']}\n"
            f"Revenue: Rs {summary['total']:.0f}\n"
            f"Top item: {summary['top_item']}\n"
            f"Pending orders: {summary['pending']}"
        )
        await self.client.send_message(self.owner_number, message)
