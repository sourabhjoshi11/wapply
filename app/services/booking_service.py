"""Booking service — asset booking for turf/hotel/banquet mode.

Supports booking bookable assets (turf, room, hall, venue) with
advance payment, slot management, and availability checking.
"""

from __future__ import annotations

import random
import string
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from app.database import supabase
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class BookingService:
    """Asset booking operations — availability, booking, cancellation."""

    # ── Assets ───────────────────────────────────────────────────────────

    async def get_assets(self, shop_id: UUID) -> list[dict[str, Any]]:
        """Get all active bookable assets for a shop.

        Args:
            shop_id: Shop UUID.

        Returns:
            List of asset dicts.
        """
        try:
            result = (
                await supabase.table("bookable_assets")
                .select("*")
                .eq("shop_id", str(shop_id))
                .eq("active", True)
                .order("name")
                .execute()
            )
            return result.data or []
        except Exception as exc:
            logger.error(
                "Failed to fetch assets",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )
            return []

    async def get_asset(self, asset_id: UUID) -> dict[str, Any] | None:
        """Get a single asset by ID.

        Args:
            asset_id: Asset UUID.

        Returns:
            Asset dict or None.
        """
        try:
            result = (
                await supabase.table("bookable_assets")
                .select("*")
                .eq("id", str(asset_id))
                .maybe_single()
                .execute()
            )
            return result.data
        except Exception:
            return None

    # ── Available Slots ──────────────────────────────────────────────────

    async def get_available_slots(
        self, shop_id: UUID, asset_id: UUID, booking_date: date
    ) -> list[dict[str, Any]]:
        """Get available time slots for an asset on a given date.

        Args:
            shop_id: Shop UUID.
            asset_id: Asset UUID.
            booking_date: Date to check.

        Returns:
            List of slot dicts: [{start: "10:00", end: "11:00"}]
        """
        asset = await self.get_asset(asset_id)
        if not asset:
            return []

        slot_duration = asset.get("slot_duration", 60)  # Default 60 min

        # Assume operating hours 6:00 - 22:00 (configurable per shop later)
        start_hour = 6
        end_hour = 22

        try:
            # Get already booked slots for this asset on this date
            booked_result = (
                await supabase.table("asset_bookings")
                .select("start_time, end_time")
                .eq("asset_id", str(asset_id))
                .eq("booking_date", booking_date.isoformat())
                .in_("status", ["booked", "confirmed"])
                .execute()
            )
            booked_slots = booked_result.data or []

            # Generate all possible slots
            all_slots: list[dict[str, Any]] = []
            current = datetime(2000, 1, 1, start_hour, 0)
            end_dt = datetime(2000, 1, 1, end_hour, 0)

            while current + timedelta(minutes=slot_duration) <= end_dt:
                slot_start = current.strftime("%H:%M")
                slot_end = (current + timedelta(minutes=slot_duration)).strftime("%H:%M")

                # Check if slot overlaps with any booking
                is_booked = False
                for booked in booked_slots:
                    bs = booked.get("start_time", "")
                    be = booked.get("end_time", "")
                    if bs and be:
                        if not (slot_end <= bs or slot_start >= be):
                            is_booked = True
                            break

                if not is_booked:
                    all_slots.append({
                        "start": slot_start,
                        "end": slot_end,
                    })

                current += timedelta(minutes=slot_duration)

            return all_slots

        except Exception as exc:
            logger.error(
                "Failed to get available slots",
                extra={
                    "shop_id": str(shop_id),
                    "asset_id": str(asset_id),
                    "date": str(booking_date),
                    "error": str(exc),
                },
            )
            return []

    # ── Create Booking ───────────────────────────────────────────────────

    async def create_booking(
        self,
        shop_id: UUID,
        asset_id: UUID,
        customer_number: str,
        customer_name: str,
        booking_date: date,
        start_time: str,
        end_time: str,
        total_amount: float,
        advance_paid: float = 0.0,
    ) -> dict[str, Any] | None:
        """Create a new booking for an asset.

        Args:
            shop_id: Shop UUID.
            asset_id: Asset UUID.
            customer_number: Customer's WhatsApp number.
            customer_name: Customer's name.
            booking_date: Booking date.
            start_time: Start time (e.g. "10:00").
            end_time: End time (e.g. "11:00").
            total_amount: Total booking amount.
            advance_paid: Advance amount paid.

        Returns:
            Created booking dict or None.
        """
        try:
            booking_code = self._generate_booking_code()

            payload = {
                "shop_id": str(shop_id),
                "asset_id": str(asset_id),
                "customer_number": customer_number,
                "customer_name": customer_name,
                "booking_date": booking_date.isoformat(),
                "start_time": start_time,
                "end_time": end_time,
                "total_amount": total_amount,
                "advance_paid": advance_paid,
                "payment_status": "partial" if advance_paid > 0 and advance_paid < total_amount else "pending",
                "status": "booked",
                "booking_code": booking_code,
            }

            if advance_paid >= total_amount:
                payload["payment_status"] = "paid"

            result = (
                await supabase.table("asset_bookings")
                .insert(payload)
                .execute()
            )

            logger.info(
                "Asset booking created",
                extra={
                    "shop_id": str(shop_id),
                    "asset_id": str(asset_id),
                    "booking_code": booking_code,
                    "date": str(booking_date),
                },
            )
            return result.data[0] if result.data else None

        except Exception as exc:
            logger.error(
                "Failed to create booking",
                extra={
                    "shop_id": str(shop_id),
                    "asset_id": str(asset_id),
                    "error": str(exc),
                },
            )
            return None

    # ── Cancel Booking ──────────────────────────────────────────────────

    async def cancel_booking(self, booking_code: str) -> bool:
        """Cancel a booking by code.

        Args:
            booking_code: Unique booking code.

        Returns:
            True on success.
        """
        try:
            await (
                supabase.table("asset_bookings")
                .update({"status": "cancelled"})
                .eq("booking_code", booking_code)
                .execute()
            )
            logger.info("Booking cancelled", extra={"booking_code": booking_code})
            return True
        except Exception as exc:
            logger.error(
                "Failed to cancel booking",
                extra={"booking_code": booking_code, "error": str(exc)},
            )
            return False

    # ── Get Bookings ─────────────────────────────────────────────────────

    async def get_bookings(
        self, shop_id: UUID, booking_date: date | None = None
    ) -> list[dict[str, Any]]:
        """Get all bookings for a shop, optionally filtered by date.

        Args:
            shop_id: Shop UUID.
            booking_date: Optional date filter.

        Returns:
            List of booking dicts.
        """
        try:
            query = (
                supabase.table("asset_bookings")
                .select("*, bookable_assets!inner(name, type)")
                .eq("shop_id", str(shop_id))
            )

            if booking_date:
                query = query.eq("booking_date", booking_date.isoformat())

            result = await query.order("start_time").execute()
            return result.data or []
        except Exception as exc:
            logger.error(
                "Failed to fetch bookings",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )
            return []

    async def get_booking_by_code(
        self, booking_code: str
    ) -> dict[str, Any] | None:
        """Get a booking by its unique code.

        Args:
            booking_code: Booking code (e.g. "TR1234").

        Returns:
            Booking dict or None.
        """
        try:
            result = (
                await supabase.table("asset_bookings")
                .select("*")
                .eq("booking_code", booking_code)
                .maybe_single()
                .execute()
            )
            return result.data
        except Exception:
            return None

    # ── Helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def _generate_booking_code() -> str:
        """Generate a random 6-character booking code."""
        chars = string.ascii_uppercase + string.digits
        return "BK" + "".join(random.choices(chars, k=4))
