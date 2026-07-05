"""Appointment service — staff, availability, booking for salon/clinic mode.

Allows customers to book appointments with specific staff members,
manages availability slots, sends reminders.
"""

from __future__ import annotations

import random
import string
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from app.database import supabase
from app.gateway.whatsapp_client import WhatsAppClient
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class AppointmentService:
    """Appointment scheduling operations."""

    # ── Services (from products table) ───────────────────────────────────

    async def get_services(self, shop_id: UUID) -> list[dict[str, Any]]:
        """Get available services (products) for appointment mode.

        Args:
            shop_id: Shop UUID.

        Returns:
            List of product dicts.
        """
        try:
            result = (
                await supabase.table("products")
                .select("*")
                .eq("shop_id", str(shop_id))
                .eq("available", True)
                .order("name")
                .execute()
            )
            return result.data or []
        except Exception as exc:
            logger.error(
                "Failed to fetch services",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )
            return []

    # ── Staff ────────────────────────────────────────────────────────────

    async def get_staff(self, shop_id: UUID) -> list[dict[str, Any]]:
        """Get active staff for a shop.

        Args:
            shop_id: Shop UUID.

        Returns:
            List of staff dicts.
        """
        try:
            result = (
                await supabase.table("staff")
                .select("*")
                .eq("shop_id", str(shop_id))
                .eq("active", True)
                .order("name")
                .execute()
            )
            return result.data or []
        except Exception as exc:
            logger.error(
                "Failed to fetch staff",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )
            return []

    # ── Available Slots ──────────────────────────────────────────────────

    async def get_available_slots(
        self, shop_id: UUID, booking_date: date, staff_id: UUID | None = None
    ) -> list[dict[str, Any]]:
        """Get available time slots for a given date.

        Considers:
        - Staff availability (day of week, start/end time)
        - Already booked appointments
        - Break times

        Args:
            shop_id: Shop UUID.
            booking_date: Date to check.
            staff_id: Optional specific staff member.

        Returns:
            List of slot dicts: [{time: "10:00", staff_id, staff_name}]
        """
        day_of_week = booking_date.weekday()  # 0=Monday

        try:
            # Get staff availability for this day
            avail_query = (
                await supabase.table("staff_availability")
                .select("*, staff!inner(name, id)")
                .eq("day_of_week", day_of_week)
                .execute()
            )
            avail_records = avail_query.data or []

            if staff_id:
                avail_records = [r for r in avail_records if r.get("staff_id") == str(staff_id)]

            if not avail_records:
                return []

            # Get already booked slots for this date
            booked_query = (
                await supabase.table("appointments")
                .select("time_slot, staff_id")
                .eq("shop_id", str(shop_id))
                .eq("appointment_date", booking_date.isoformat())
                .in_("status", ["booked", "confirmed"])
                .execute()
            )
            booked = booked_query.data or []
            booked_set = {
                (b["time_slot"], b["staff_id"])
                for b in booked
                if b.get("time_slot") and b.get("staff_id")
            }

            available_slots: list[dict[str, Any]] = []
            for avail in avail_records:
                s_id = avail["staff_id"]
                s_name = avail.get("staff", {}).get("name", "Staff")
                start_h, start_m = map(int, avail["start_time"].split(":"))
                end_h, end_m = map(int, avail["end_time"].split(":"))
                slot_duration = avail.get("slot_duration", 30)

                break_start = avail.get("break_start")
                break_end = avail.get("break_end")

                # Generate slots
                current = datetime(2000, 1, 1, start_h, start_m)
                end_dt = datetime(2000, 1, 1, end_h, end_m)

                while current + timedelta(minutes=slot_duration) <= end_dt:
                    slot_time = current.strftime("%H:%M")

                    # Skip break
                    if break_start and break_end:
                        bs_h, bs_m = map(int, break_start.split(":"))
                        be_h, be_m = map(int, break_end.split(":"))
                        bs_dt = datetime(2000, 1, 1, bs_h, bs_m)
                        be_dt = datetime(2000, 1, 1, be_h, be_m)
                        if bs_dt <= current < be_dt:
                            current += timedelta(minutes=slot_duration)
                            continue

                    # Check not booked
                    if (slot_time, s_id) not in booked_set:
                        available_slots.append({
                            "time": slot_time,
                            "staff_id": s_id,
                            "staff_name": s_name,
                        })

                    current += timedelta(minutes=slot_duration)

            # Sort by time then staff
            available_slots.sort(key=lambda x: (x["time"], x["staff_name"]))
            return available_slots

        except Exception as exc:
            logger.error(
                "Failed to get available slots",
                extra={"shop_id": str(shop_id), "date": str(booking_date), "error": str(exc)},
            )
            return []

    # ── Booking ──────────────────────────────────────────────────────────

    async def book_appointment(
        self,
        shop_id: UUID,
        customer_number: str,
        service_name: str,
        service_price: float,
        appointment_date: date,
        time_slot: str,
        staff_id: UUID | None = None,
    ) -> dict[str, Any] | None:
        """Book an appointment.

        Args:
            shop_id: Shop UUID.
            customer_number: Customer's WhatsApp number.
            service_name: Name of the service.
            service_price: Price of the service.
            appointment_date: Date of appointment.
            time_slot: Time slot string (e.g. "10:00").
            staff_id: Optional staff member UUID.

        Returns:
            Created appointment dict or None.
        """
        try:
            booking_code = self._generate_booking_code()

            payload = {
                "shop_id": str(shop_id),
                "customer_number": customer_number,
                "service_name": service_name,
                "service_price": service_price,
                "appointment_date": appointment_date.isoformat(),
                "time_slot": time_slot,
                "status": "booked",
            }
            if staff_id:
                payload["staff_id"] = str(staff_id)

            result = (
                await supabase.table("appointments")
                .insert(payload)
                .execute()
            )

            logger.info(
                "Appointment booked",
                extra={
                    "shop_id": str(shop_id),
                    "customer": customer_number,
                    "service": service_name,
                    "date": str(appointment_date),
                    "time": time_slot,
                },
            )
            return result.data[0] if result.data else None

        except Exception as exc:
            logger.error(
                "Failed to book appointment",
                extra={
                    "shop_id": str(shop_id),
                    "customer": customer_number,
                    "error": str(exc),
                },
            )
            return None

    async def cancel_appointment(self, appointment_id: UUID) -> bool:
        """Cancel an appointment.

        Args:
            appointment_id: Appointment UUID.

        Returns:
            True on success.
        """
        try:
            await (
                supabase.table("appointments")
                .update({"status": "cancelled"})
                .eq("id", str(appointment_id))
                .execute()
            )
            logger.info("Appointment cancelled", extra={"appointment_id": str(appointment_id)})
            return True
        except Exception as exc:
            logger.error(
                "Failed to cancel appointment",
                extra={"appointment_id": str(appointment_id), "error": str(exc)},
            )
            return False

    # ── Reminders ────────────────────────────────────────────────────────

    async def send_reminder(
        self,
        appointment_id: UUID,
        client: WhatsAppClient,
    ) -> None:
        """Send a reminder for an upcoming appointment.

        Args:
            appointment_id: Appointment UUID.
            client: WhatsAppClient instance.
        """
        try:
            result = (
                await supabase.table("appointments")
                .select("*, shops!inner(name, owner_whatsapp_number)")
                .eq("id", str(appointment_id))
                .single()
                .execute()
            )
            apt = result.data
            if not apt:
                return

            customer_number = apt.get("customer_number", "")
            service = apt.get("service_name", "Service")
            apt_date = apt.get("appointment_date", "")
            time_slot = apt.get("time_slot", "")

            if customer_number:
                msg = (
                    f"⏰ *Reminder*\n\n"
                    f"Aaj {time_slot} pe *{service}* appointment hai.\n"
                    f"Date: {apt_date}\n\n"
                    f"Kripya samay par pahunchne ka kast karein. 🙏"
                )
                await client.send_message(customer_number, msg)

            # Mark reminder as sent
            await (
                supabase.table("appointments")
                .update({"reminder_sent": True})
                .eq("id", str(appointment_id))
                .execute()
            )

            logger.info("Appointment reminder sent", extra={"appointment_id": str(appointment_id)})

        except Exception as exc:
            logger.error(
                "Failed to send appointment reminder",
                extra={"appointment_id": str(appointment_id), "error": str(exc)},
            )

    async def check_and_send_reminders(self) -> None:
        """Check upcoming appointments and send reminders.

        Called by APScheduler every 15 minutes.
        Sends reminder for appointments happening in 1 hour.
        """
        now = datetime.now(timezone.utc)
        target_time = now + timedelta(hours=1)
        target_date = target_time.date()
        target_hour = target_time.hour
        target_min = target_time.minute

        # Round to nearest hour slot
        target_slot = f"{target_hour:02d}:{target_min:02d}"

        try:
            # Find appointments in ~1 hour that haven't had reminders
            result = (
                await supabase.table("appointments")
                .select("*, shops!inner(*)")
                .eq("appointment_date", target_date.isoformat())
                .eq("time_slot", target_slot)
                .eq("reminder_sent", False)
                .in_("status", ["booked", "confirmed"])
                .execute()
            )
            appointments = result.data or []

            for apt in appointments:
                shop = apt.get("shops", {})
                if not shop:
                    continue

                client = WhatsAppClient(
                    access_token=shop.get("access_token", ""),
                    phone_number_id=shop.get("phone_number_id", ""),
                )
                await self.send_reminder(apt["id"], client)

        except Exception as exc:
            logger.error("Failed to check and send reminders", extra={"error": str(exc)})

    # ── Daily appointments ───────────────────────────────────────────────

    async def get_daily_appointments(
        self, shop_id: UUID, appointment_date: date | None = None
    ) -> list[dict[str, Any]]:
        """Get all appointments for a given day.

        Args:
            shop_id: Shop UUID.
            appointment_date: Date to check (defaults to today).

        Returns:
            List of appointment dicts.
        """
        if appointment_date is None:
            appointment_date = date.today()

        try:
            result = (
                await supabase.table("appointments")
                .select("*")
                .eq("shop_id", str(shop_id))
                .eq("appointment_date", appointment_date.isoformat())
                .order("time_slot")
                .execute()
            )
            return result.data or []
        except Exception as exc:
            logger.error(
                "Failed to fetch daily appointments",
                extra={"shop_id": str(shop_id), "date": str(appointment_date), "error": str(exc)},
            )
            return []

    # ── Helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def _generate_booking_code() -> str:
        """Generate a random 6-character booking code."""
        chars = string.ascii_uppercase + string.digits
        return "AP" + "".join(random.choices(chars, k=4))
