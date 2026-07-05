"""Pydantic models for the products table."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class Product(BaseModel):
    """Represents a product belonging to a shop."""

    id: UUID
    shop_id: UUID
    name: str
    price: Decimal
    category: Optional[str] = None
    available: bool = True
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
