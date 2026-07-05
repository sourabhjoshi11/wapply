"""Wallet system — balance tracking, order deductions, subscription fees.

Shop wallets are created on shop creation. Monthly subscription and per-order
fees are deducted automatically. Low/zero balance alerts are sent to owners.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.database import supabase
from app.gateway.whatsapp_client import WhatsAppClient
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

# ── Pricing ──────────────────────────────────────────────────────────────

SUBSCRIPTION_SHOP = Decimal("199.00")  # ₹199/month for shops
SUBSCRIPTION_RESTAURANT = Decimal("499.00")  # ₹499/month for restaurants
FREE_ORDERS_SHOP = 300  # Free orders per month for shops
FREE_ORDERS_RESTAURANT = 500  # Free orders per month for restaurants
PER_ORDER_FEE_SHOP = Decimal("2.00")  # ₹2/order beyond free limit
PER_ORDER_FEE_RESTAURANT = Decimal("1.00")  # ₹1/order beyond free limit
LOW_BALANCE_THRESHOLD = Decimal("50.00")  # Alert when balance below ₹50
RECHARGE_LINK = "https://wa.me/919999999999"  # TODO: Make configurable per shop


class WalletService:
    """Wallet operations — balance, credit, debit, deductions."""

    # ── Balance ──────────────────────────────────────────────────────────

    async def get_balance(self, shop_id: UUID) -> Decimal:
        """Return current wallet balance for a shop.

        Args:
            shop_id: Shop UUID.

        Returns:
            Current balance as Decimal (0 if no wallet exists).
        """
        try:
            result = (
                await supabase.table("wallets")
                .select("balance")
                .eq("shop_id", str(shop_id))
                .maybe_single()
                .execute()
            )
            if result.data:
                return Decimal(str(result.data["balance"]))
        except Exception as exc:
            logger.error(
                "Failed to fetch wallet balance",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )
        return Decimal("0")

    async def ensure_wallet(self, shop_id: UUID) -> None:
        """Create a wallet for a shop if it doesn't exist.

        Args:
            shop_id: Shop UUID.
        """
        try:
            existing = (
                await supabase.table("wallets")
                .select("id")
                .eq("shop_id", str(shop_id))
                .maybe_single()
                .execute()
            )
            if existing.data:
                return

            await supabase.table("wallets").insert(
                {"shop_id": str(shop_id), "balance": 0}
            ).execute()
            logger.info("Wallet created", extra={"shop_id": str(shop_id)})
        except Exception as exc:
            logger.error(
                "Failed to create wallet",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )

    # ── Transactions ─────────────────────────────────────────────────────

    async def credit(
        self,
        shop_id: UUID,
        amount: Decimal,
        description: str,
    ) -> bool:
        """Credit (add) money to a shop's wallet.

        Args:
            shop_id: Shop UUID.
            amount: Amount to credit.
            description: Transaction description.

        Returns:
            True on success.
        """
        return await self._transaction(shop_id, "credit", amount, description)

    async def debit(
        self,
        shop_id: UUID,
        amount: Decimal,
        description: str,
        order_id: str | None = None,
    ) -> bool:
        """Debit (deduct) money from a shop's wallet.

        Args:
            shop_id: Shop UUID.
            amount: Amount to debit.
            description: Transaction description.
            order_id: Optional order UUID for order-related deductions.

        Returns:
            True on success.
        """
        return await self._transaction(shop_id, "debit", amount, description, order_id)

    async def _transaction(
        self,
        shop_id: UUID,
        txn_type: str,
        amount: Decimal,
        description: str,
        order_id: str | None = None,
    ) -> bool:
        """Record a wallet transaction and update balance."""
        try:
            if txn_type == "debit":
                amount = -abs(amount)

            # Supabase REST doesn't support increment directly, so we
            # 1. Fetch current balance
            # 2. Compute new balance
            # 3. Update

            current = (
                await supabase.table("wallets")
                .select("balance")
                .eq("shop_id", str(shop_id))
                .single()
                .execute()
            )
            if not current.data:
                logger.error("Wallet not found for shop", extra={"shop_id": str(shop_id)})
                return False

            new_balance = Decimal(str(current.data["balance"])) + (
                amount if txn_type == "credit" else -abs(amount)
            )
            new_balance = max(new_balance, Decimal("0"))

            await (
                supabase.table("wallets")
                .update({"balance": float(new_balance)})
                .eq("shop_id", str(shop_id))
                .execute()
            )

            # Insert transaction log
            txn_payload: dict[str, Any] = {
                "shop_id": str(shop_id),
                "type": txn_type,
                "amount": float(abs(amount)),
                "description": description,
            }
            if order_id:
                txn_payload["order_id"] = order_id

            await supabase.table("wallet_transactions").insert(txn_payload).execute()

            logger.info(
                "Wallet transaction recorded",
                extra={
                    "shop_id": str(shop_id),
                    "type": txn_type,
                    "amount": float(abs(amount)),
                    "new_balance": float(new_balance),
                },
            )

            # Check low balance
            if new_balance < LOW_BALANCE_THRESHOLD and new_balance > Decimal("0"):
                await self._send_low_balance_alert(shop_id, new_balance)
            elif new_balance <= Decimal("0"):
                await self._send_zero_balance_alert(shop_id)

            return True
        except Exception as exc:
            logger.error(
                "Wallet transaction failed",
                extra={
                    "shop_id": str(shop_id),
                    "type": txn_type,
                    "amount": float(abs(amount)),
                    "error": str(exc),
                },
            )
            return False

    # ── Order deduction ──────────────────────────────────────────────────

    async def check_and_deduct_order(
        self, shop_id: UUID, order_id: str
    ) -> bool:
        """Check free order limit and deduct wallet if exceeded.

        Returns True if the order can proceed (either within free limit
        or wallet deduction succeeded). Returns False if wallet is
        insufficient (zero balance after free limit exhausted), which
        should pause the bot for that shop.

        Args:
            shop_id: Shop UUID.
            order_id: Order UUID.

        Returns:
            True if order can proceed, False if bot should be paused.
        """
        monthly_count = await self.count_monthly_orders(shop_id)
        shop = await self._get_shop(shop_id)
        if not shop:
            return True  # Allow if we can't determine

        mode = shop.get("mode", "ordering")
        is_restaurant = mode in ("dine_in", "both")
        free_limit = FREE_ORDERS_RESTAURANT if is_restaurant else FREE_ORDERS_SHOP
        per_fee = PER_ORDER_FEE_RESTAURANT if is_restaurant else PER_ORDER_FEE_SHOP

        if monthly_count <= free_limit:
            return True  # Within free limit

        # Exceeded free limit — deduct from wallet
        description = f"Order fee (month #{datetime.now(timezone.utc).month})"
        success = await self.debit(shop_id, per_fee, description, order_id)

        if not success:
            # Check if wallet is truly at zero
            balance = await self.get_balance(shop_id)
            if balance <= Decimal("0"):
                await self._pause_bot(shop_id, shop)
                return False

        return True

    async def count_monthly_orders(self, shop_id: UUID) -> int:
        """Count orders for the current month for a shop.

        Args:
            shop_id: Shop UUID.

        Returns:
            Number of orders this month.
        """
        today = date.today()
        first_of_month = today.replace(day=1).isoformat()
        try:
            result = (
                await supabase.table("orders")
                .select("id")
                .eq("shop_id", str(shop_id))
                .gte("created_at", first_of_month)
                .execute()
            )
            return len(result.data) if result.data else 0
        except Exception as exc:
            logger.error(
                "Failed to count monthly orders",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )
            return 0

    # ── Monthly subscription ─────────────────────────────────────────────

    async def monthly_subscription_deduct(self) -> None:
        """Deduct monthly subscription fees from all active shops.

        Called by APScheduler on 1st of every month at 9AM IST.
        Shops with insufficient balance get paused.
        Processes up to 10 shops concurrently for faster execution.
        """
        try:
            shops_result = (
                await supabase.table("shops")
                .select("*")
                .eq("active", True)
                .execute()
            )
            shops = shops_result.data or []
        except Exception as exc:
            logger.error("Failed to fetch shops for subscription deduct", extra={"error": str(exc)})
            return

        sem = asyncio.Semaphore(10)

        async def _process_one(shop: dict[str, Any]) -> None:
            async with sem:
                try:
                    shop_id = shop["id"]
                    await self.ensure_wallet(shop_id)

                    mode = shop.get("mode", "ordering")
                    is_restaurant = mode in ("dine_in", "both")
                    amount = SUBSCRIPTION_RESTAURANT if is_restaurant else SUBSCRIPTION_SHOP
                    description = f"Monthly subscription ({date.today().strftime('%B %Y')})"

                    success = await self.debit(shop_id, amount, description)
                    if success:
                        logger.info(
                            "Monthly subscription deducted",
                            extra={"shop_id": str(shop_id), "amount": float(amount)},
                        )
                    else:
                        logger.warning(
                            "Monthly subscription failed — insufficient balance",
                            extra={"shop_id": str(shop_id), "amount": float(amount)},
                        )
                        await self._send_zero_balance_alert(shop_id)
                except Exception as exc:
                    logger.error(
                        "Subscription deduct error for shop",
                        extra={"shop_id": str(shop.get("id")), "error": str(exc)},
                    )

        await asyncio.gather(*[_process_one(shop) for shop in shops])

    # ── Balance alerts ───────────────────────────────────────────────────

    async def _send_low_balance_alert(self, shop_id: UUID, balance: Decimal) -> None:
        """Send low balance WhatsApp alert to shop owner."""
        try:
            shop = await self._get_shop(shop_id)
            if not shop:
                return

            owner_number = shop.get("owner_whatsapp_number", "")
            token = shop.get("access_token", "")
            phone_id = shop.get("phone_number_id", "")
            if not owner_number or not token or not phone_id:
                return

            client = WhatsAppClient(token, phone_id)
            msg = (
                f"⚠️ *Wallet Balance Low*\n\n"
                f"Current balance: ₹{float(balance):.2f}\n\n"
                f"Please recharge to continue using the bot.\n"
                f"Recharge link: {RECHARGE_LINK}"
            )
            await client.send_message(owner_number, msg)
            logger.info("Low balance alert sent", extra={"shop_id": str(shop_id), "balance": float(balance)})
        except Exception as exc:
            logger.error("Failed to send low balance alert", extra={"shop_id": str(shop_id), "error": str(exc)})

    async def _send_zero_balance_alert(self, shop_id: UUID) -> None:
        """Send zero balance alert and pause bot."""
        try:
            shop = await self._get_shop(shop_id)
            if not shop:
                return

            owner_number = shop.get("owner_whatsapp_number", "")
            token = shop.get("access_token", "")
            phone_id = shop.get("phone_number_id", "")
            if not owner_number or not token or not phone_id:
                return

            client = WhatsAppClient(token, phone_id)
            msg = (
                f"❌ *Bot Paused — Zero Balance*\n\n"
                f"Aapke wallet mein balance zero hai. Bot temporarily pause kar diya gaya hai.\n\n"
                f"Recharge karein: {RECHARGE_LINK}\n\n"
                f"Recharge ke baad bot automatically resume ho jayega."
            )
            await client.send_message(owner_number, msg)
            logger.info("Zero balance alert sent", extra={"shop_id": str(shop_id)})
        except Exception as exc:
            logger.error("Failed to send zero balance alert", extra={"shop_id": str(shop_id), "error": str(exc)})

    async def send_low_balance_alert(self, shop_id: UUID) -> None:
        """Public method to trigger low balance check and alert."""
        balance = await self.get_balance(shop_id)
        if balance < LOW_BALANCE_THRESHOLD:
            if balance <= Decimal("0"):
                await self._send_zero_balance_alert(shop_id)
            else:
                await self._send_low_balance_alert(shop_id, balance)

    async def _pause_bot(self, shop_id: UUID, shop: dict[str, Any]) -> None:
        """Pause a shop's bot by setting active=False."""
        try:
            await (
                supabase.table("shops")
                .update({"active": False})
                .eq("id", str(shop_id))
                .execute()
            )
            logger.warning("Bot paused for shop (zero balance)", extra={"shop_id": str(shop_id)})
        except Exception as exc:
            logger.error(
                "Failed to pause bot for shop",
                extra={"shop_id": str(shop_id), "error": str(exc)},
            )

    async def _get_shop(self, shop_id: UUID) -> dict[str, Any] | None:
        """Fetch shop record."""
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
