"""Pydantic models for the orders table."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel


class Order(BaseModel):
    """Represents a customer order."""

    id: UUID
    shop_id: UUID
    customer_number: str
    items: list[dict[str, Any]]
    total: Decimal
    address: Optional[str] = None
    payment_method: Optional[str] = None
    status: str = "PENDING"
    order_code: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class OrderCreate(BaseModel):
    """Schema for creating a new order."""

    shop_id: UUID
    customer_number: str
    items: list[dict[str, Any]]
    total: Decimal
    address: Optional[str] = None
    payment_method: Optional[str] = None
    order_code: str

    model_config = {"from_attributes": True}


class OrderStatus(str):
    """Possible order statuses."""

    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"
