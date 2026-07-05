"""Pydantic models for the shops table."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class Shop(BaseModel):
    """Represents a shop/tenant in the multi-tenant system."""

    id: UUID
    name: str
    whatsapp_number: str
    owner_whatsapp_number: str
    google_sheet_id: Optional[str] = None
    gateway_type: str = "cloud_api"
    active: bool = True
    access_token: Optional[str] = None
    phone_number_id: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ShopCreate(BaseModel):
    """Schema for creating a new shop."""

    name: str = Field(..., min_length=1, max_length=200)
    whatsapp_number: str = Field(..., pattern=r"^\d{10,15}$")
    owner_whatsapp_number: str = Field(..., pattern=r"^\d{10,15}$")
    google_sheet_id: Optional[str] = None
    access_token: str = Field(..., min_length=1)
    phone_number_id: str = Field(..., min_length=1)

    model_config = {"from_attributes": True}
