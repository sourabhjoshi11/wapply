"""Service for managing WhatsApp conversation state machine."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.database import supabase
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class ConversationService:
    """CRUD and state management for customer conversations."""

    TABLE = "conversations"

    async def get_or_create(
        self, shop_id: UUID, customer_number: str
    ) -> dict[str, Any]:
        """Retrieve an existing conversation or create a new one.

        Args:
            shop_id: The shop's UUID.
            customer_number: Customer's WhatsApp number.

        Returns:
            Conversation record as a dict.
        """
        try:
            result = (
                supabase.table(self.TABLE)
                .select("*")
                .eq("shop_id", str(shop_id))
                .eq("customer_number", customer_number)
                .execute()
            )
            if result.data:
                return result.data[0]

            # Create new conversation
            new_conv = {
                "shop_id": str(shop_id),
                "customer_number": customer_number,
                "state": "GREETING",
                "cart": {},
                "context": {},
            }
            insert_result = (
                supabase.table(self.TABLE).insert(new_conv).execute()
            )
            logger.info(
                "New conversation created",
                extra={"shop_id": str(shop_id), "customer": customer_number},
            )
            return insert_result.data[0]
        except Exception as exc:
            logger.error(
                "Failed to get/create conversation",
                extra={
                    "shop_id": str(shop_id),
                    "customer": customer_number,
                    "error": str(exc),
                },
            )
            raise

    async def update_state(self, conversation_id: UUID, new_state: str) -> bool:
        """Transition the conversation to a new state.

        Args:
            conversation_id: Conversation UUID.
            new_state: Target state string.

        Returns:
            True if successful.
        """
        try:
            supabase.table(self.TABLE).update(
                {"state": new_state, "updated_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", str(conversation_id)).execute()
            logger.debug(
                "Conversation state updated",
                extra={"conv_id": str(conversation_id), "state": new_state},
            )
            return True
        except Exception as exc:
            logger.error(
                "Failed to update conversation state",
                extra={
                    "conv_id": str(conversation_id),
                    "state": new_state,
                    "error": str(exc),
                },
            )
            return False

    async def update_cart(
        self, conversation_id: UUID, cart: dict[str, Any]
    ) -> bool:
        """Update the cart JSONB field.

        Args:
            conversation_id: Conversation UUID.
            cart: Cart data dict (product_id -> {name, price, quantity}).

        Returns:
            True if successful.
        """
        try:
            supabase.table(self.TABLE).update(
                {"cart": cart, "updated_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", str(conversation_id)).execute()
            return True
        except Exception as exc:
            logger.error(
                "Failed to update cart",
                extra={"conv_id": str(conversation_id), "error": str(exc)},
            )
            return False

    async def update_context(
        self, conversation_id: UUID, context: dict[str, Any]
    ) -> bool:
        """Update the context JSONB field (stores temporary state like current_category).

        Args:
            conversation_id: Conversation UUID.
            context: Context data dict.

        Returns:
            True if successful.
        """
        try:
            supabase.table(self.TABLE).update(
                {"context": context, "updated_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", str(conversation_id)).execute()
            return True
        except Exception as exc:
            logger.error(
                "Failed to update context",
                extra={"conv_id": str(conversation_id), "error": str(exc)},
            )
            return False

    async def reset(self, conversation_id: UUID) -> bool:
        """Reset conversation to initial state (GREETING) with empty cart/context.

        Args:
            conversation_id: Conversation UUID.

        Returns:
            True if successful.
        """
        try:
            supabase.table(self.TABLE).update(
                {
                    "state": "GREETING",
                    "cart": {},
                    "context": {},
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", str(conversation_id)).execute()
            return True
        except Exception as exc:
            logger.error(
                "Failed to reset conversation",
                extra={"conv_id": str(conversation_id), "error": str(exc)},
            )
            return False
