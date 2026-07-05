"""Service for syncing product catalog from Google Sheets."""

from __future__ import annotations

import json
import os
from typing import Any

from google.oauth2.service_account import Credentials
from google.auth.exceptions import GoogleAuthError

from app.config import settings
from app.services.catalog_service import CatalogService
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

SHEET_SCOPE = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]


class SheetSyncService:
    """Reads product catalog from Google Sheets and upserts into the database."""

    def __init__(self, shop: dict[str, Any]) -> None:
        self.shop = shop
        self.shop_id = shop["id"]
        self.sheet_id = shop.get("google_sheet_id")
        self.catalog = CatalogService()

    async def sync(self) -> dict[str, Any]:
        """Sync products from Google Sheets to the database.

        Returns:
            Dict with sync result: synced (count), errors (list).
        """
        result: dict[str, Any] = {"synced": 0, "errors": []}

        if not self.sheet_id:
            logger.info(
                "No Google Sheet ID configured for shop",
                extra={"shop_id": str(self.shop_id)},
            )
            return result

        try:
            records = self._read_sheet()
        except Exception as exc:
            err_msg = f"Failed to read sheet: {exc}"
            logger.error(err_msg, extra={"shop_id": str(self.shop_id), "sheet_id": self.sheet_id})
            result["errors"].append(err_msg)
            return result

        for idx, row in enumerate(records, start=2):  # row 2+ (header is row 1)
            try:
                name = str(row.get("name", "")).strip()
                if not name:
                    continue

                price_raw = row.get("price", 0)
                price = float(price_raw) if price_raw else 0.0

                category = str(row.get("category", "")).strip() or None
                available_raw = row.get("available", "TRUE")
                available = str(available_raw).strip().upper() in ("TRUE", "1", "YES", "Y")

                await self.catalog.upsert_product(
                    shop_id=self.shop_id,
                    name=name,
                    price=price,
                    category=category,
                    available=available,
                )
                result["synced"] += 1
            except Exception as exc:
                err_msg = f"Row {idx}: {exc}"
                logger.warning(err_msg, extra={"shop_id": str(self.shop_id)})
                result["errors"].append(err_msg)

        logger.info(
            "Sheet sync completed",
            extra={
                "shop_id": str(self.shop_id),
                "synced": result["synced"],
                "errors": len(result["errors"]),
            },
        )
        return result

    def _read_sheet(self) -> list[dict[str, str]]:
        """Read all rows from the configured Google Sheet.

        Expected columns: name | price | category | available

        Returns:
            List of dicts (one per row after header).

        Raises:
            FileNotFoundError: If credentials file is missing.
            GoogleAuthError: If authentication fails.
            Exception: For other sheet read errors.
        """
        creds = self._get_credentials()
        import gspread  # lazy import to avoid crash if gspread is missing

        gc = gspread.authorize(creds)
        sh = gc.open_by_key(self.sheet_id)
        worksheet = sh.sheet1
        all_records = worksheet.get_all_records()
        return all_records

    def _get_credentials(self) -> Credentials:
        """Build Google service account credentials from env config.

        Supports both file path and inline JSON.

        Returns:
            Authenticated Credentials object.

        Raises:
            FileNotFoundError: If credentials path doesn't exist.
            GoogleAuthError: If JSON is invalid.
        """
        raw = settings.google_sheets_credentials
        if not raw:
            raise GoogleAuthError("GOOGLE_SHEETS_CREDENTIALS is not configured")

        if settings.is_google_sheets_credentials_json:
            info = json.loads(raw)
            return Credentials.from_service_account_info(info, scopes=SHEET_SCOPE)
        else:
            path = raw.strip()
            if not os.path.isfile(path):
                raise FileNotFoundError(
                    f"Google credentials file not found: {path}"
                )
            return Credentials.from_service_account_file(path, scopes=SHEET_SCOPE)
