"""Pydantic models for the conversations table."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel


class Conversation(BaseModel):
    """Represents a customer conversation with state machine tracking."""

    id: UUID
    shop_id: UUID
    customer_number: str
    state: str = "GREETING"
    cart: dict[str, Any] = {}
    context: dict[str, Any] = {}
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
