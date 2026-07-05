"""Dine-in service — table management, QR generation, billing.

Supports restaurant dine-in mode where customers at tables order via WhatsApp.
"""

from __future__ import annotations

import io
import re
from typing import Any
from uuid import UUID

import qrcode
from qrcode.image.pil import PilImage

from app.config import settings
from app.database import supabase
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class DineInService:
    """Dine-in operations — tables, QR codes, billing."""

    # ── Table detection ──────────────────────────────────────────────────

    @staticmethod
    def detect_table_from_message(text: str) -> int | None:
        """Extract table number from a message like 'TABLE5' or 'table 5'.

        Args:
            text: Incoming message text.

        Returns:
            Table number (int) or None if not found.
        """
        match = re.search(r"(?:TABLE|table|टेबल|t)(?:\s*)(\d{1,3})", text.strip())
        if match:
            return int(match.group(1))
        return None

    # ── Table CRUD ───────────────────────────────────────────────────────

    async def get_available_tables(self, shop_id: UUID) -> list[dict[str, Any]]:
        """Get all active tables for a shop.

        Args:
            shop_id: Shop UUID.

        Returns:
            List of table dicts.
        """
        try:
            result = (
                await supabase.table("tables")
                .select("*")
                .eq("shop_id", str(shop_id))
                .eq("active", True)
                .order("table_number")
                .execute()
            )
            return result.data or []
        except Exception as exc:
            logger.error(
                "Failed to fetch tables",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )
            return []

    async def create_table(
        self, shop_id: UUID, table_number: int, table_name: str | None = None
    ) -> dict[str, Any] | None:
        """Create a new table for dine-in.

        Args:
            shop_id: Shop UUID.
            table_number: Table number.
            table_name: Optional display name.

        Returns:
            Created table dict or None.
        """
        try:
            result = (
                await supabase.table("tables")
                .insert({
                    "shop_id": str(shop_id),
                    "table_number": table_number,
                    "table_name": table_name or f"Table {table_number}",
                    "active": True,
                })
                .execute()
            )
            return result.data[0] if result.data else None
        except Exception as exc:
            logger.error(
                "Failed to create table",
                extra={"shop_id": str(shop_id), "table_number": table_number, "error": str(exc)},
            )
            return None

    async def get_table(self, shop_id: UUID, table_number: int) -> dict[str, Any] | None:
        """Get a table by number.

        Args:
            shop_id: Shop UUID.
            table_number: Table number.

        Returns:
            Table dict or None.
        """
        try:
            result = (
                await supabase.table("tables")
                .select("*")
                .eq("shop_id", str(shop_id))
                .eq("table_number", table_number)
                .maybe_single()
                .execute()
            )
            return result.data
        except Exception:
            return None

    # ── QR Code generation ───────────────────────────────────────────────

    async def generate_qr_code(
        self, shop_id: UUID, table_number: int, bot_number: str
    ) -> str | None:
        """Generate a QR code for a table and upload to Supabase Storage.

        The QR encodes a WhatsApp deep link:
        https://wa.me/{bot_number}?text=TABLE{table_number}

        Args:
            shop_id: Shop UUID.
            table_number: Table number.
            bot_number: The shop's WhatsApp number (for deep link).

        Returns:
            Public URL of the QR code image, or None on failure.
        """
        try:
            # Get shop name
            shop = await self._get_shop(shop_id)
            shop_name = shop.get("name", "Shop") if shop else "Shop"

            # Generate QR code
            wa_link = f"https://wa.me/{bot_number}?text=TABLE{table_number}"
            qr = qrcode.QRCode(
                version=2,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=10,
                border=2,
            )
            qr.add_data(wa_link)
            qr.make(fit=True)

            img: PilImage = qr.make_image(fill_color="black", back_color="white")

            # Convert to bytes
            img_bytes = io.BytesIO()
            img.save(img_bytes, format="PNG")
            img_data = img_bytes.getvalue()

            # Upload to Supabase Storage
            storage_path = f"qrcodes/{shop_id}/table_{table_number}.png"
            public_url = await supabase.storage.upload(
                bucket="media",
                path=storage_path,
                file_data=img_data,
                content_type="image/png",
                upsert=True,
            )

            if not public_url:
                logger.error("Failed to upload QR code", extra={"shop_id": str(shop_id), "table": table_number})
                return None

            # Save URL to tables record
            await (
                supabase.table("tables")
                .update({"qr_code_url": public_url})
                .eq("shop_id", str(shop_id))
                .eq("table_number", table_number)
                .execute()
            )

            logger.info(
                "QR code generated",
                extra={"shop_id": str(shop_id), "table": table_number, "url": public_url},
            )
            return public_url

        except Exception as exc:
            logger.error(
                "Failed to generate QR code",
                extra={"shop_id": str(shop_id), "table": table_number, "error": str(exc)},
            )
            return None

    async def generate_all_qrs(self, shop_id: UUID) -> list[dict[str, Any]]:
        """Generate QR codes for all tables of a shop.

        Args:
            shop_id: Shop UUID.

        Returns:
            List of dicts with {table_number, qr_code_url}.
        """
        tables = await self.get_available_tables(shop_id)
        shop = await self._get_shop(shop_id)
        bot_number = shop.get("phone_number_id", "") if shop else ""

        results = []
        for table in tables:
            url = await self.generate_qr_code(shop_id, table["table_number"], bot_number)
            results.append({"table_number": table["table_number"], "qr_code_url": url})

        return results

    # ── Billing ──────────────────────────────────────────────────────────

    async def send_bill(
        self,
        shop_id: UUID,
        table_number: int,
        client: Any,  # WhatsAppClient
        owner_number: str,
        gst_percentage: float = 5.0,
    ) -> bool:
        """Calculate and send bill to customer. Also send to owner.

        Args:
            shop_id: Shop UUID.
            table_number: Table number.
            client: WhatsAppClient instance for sending.
            owner_number: Owner's WhatsApp number.
            gst_percentage: GST rate to apply.

        Returns:
            True if bill sent successfully.
        """
        try:
            # Get all unpaid dine-in orders for this table
            orders_result = (
                await supabase.table("orders")
                .select("*")
                .eq("shop_id", str(shop_id))
                .eq("table_number", table_number)
                .eq("bill_sent", False)
                .execute()
            )
            unpaid_orders = orders_result.data or []

            if not unpaid_orders:
                await client.send_message(
                    owner_number,
                    f"Table {table_number}: No unpaid orders found.",
                )
                return True

            # Calculate totals
            subtotal = 0.0
            all_items: list[dict[str, Any]] = []
            for order in unpaid_orders:
                items = order.get("items", [])
                for item in items:
                    qty = int(item.get("quantity", 1))
                    price = float(item.get("price", 0))
                    total = qty * price
                    all_items.append({
                        "name": item.get("name", "Item"),
                        "qty": qty,
                        "price": price,
                        "total": total,
                    })
                    subtotal += total

            gst = subtotal * (gst_percentage / 100)
            grand_total = subtotal + gst

            # Build bill message
            lines = [
                "🧾 *Bill — Table {}*".format(table_number),
                "─" * 20,
            ]
            for item in all_items:
                lines.append(f"{item['name']} x{item['qty']} = ₹{item['total']:.0f}")
            lines.extend([
                "─" * 20,
                f"Subtotal: ₹{subtotal:.0f}",
                f"GST ({gst_percentage:.0f}%): ₹{gst:.0f}",
                f"*Total: ₹{grand_total:.0f}*",
                "─" * 20,
                "Thank you! 🙏",
            ])
            bill_text = "\n".join(lines)

            # Send to customer via the last order's customer number
            customer_number = unpaid_orders[0].get("customer_number", "")
            if customer_number:
                await client.send_message(customer_number, bill_text)

            # Also send to owner
            await client.send_message(owner_number, f"🧾 Bill sent for Table {table_number}\n\nTotal: ₹{grand_total:.0f}")

            # Mark bill_sent
            for order in unpaid_orders:
                await (
                    supabase.table("orders")
                    .update({"bill_sent": True})
                    .eq("id", str(order["id"]))
                    .execute()
                )

            logger.info(
                "Bill sent for table",
                extra={"shop_id": str(shop_id), "table": table_number, "total": grand_total},
            )
            return True

        except Exception as exc:
            logger.error(
                "Failed to send bill",
                extra={"shop_id": str(shop_id), "table": table_number, "error": str(exc)},
            )
            return False

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _get_shop(self, shop_id: UUID) -> dict[str, Any] | None:
        try:
            result = (
                await supabase.table("shops")
                .select("*")
                .eq("id", str(shop_id))
                .maybe_single()
                .execute()
            )
            return result.data
        except Exception:
            return None
