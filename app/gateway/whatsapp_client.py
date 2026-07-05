"""Meta WhatsApp Cloud API client for sending messages.

Supports text, image, interactive buttons, and list messages.
All media is uploaded to Supabase Storage (no local filesystem).
"""

from __future__ import annotations

from typing import Any

import httpx

from app.config import settings
from app.database import supabase
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

WHATSAPP_API_BASE = "https://graph.facebook.com"


class WhatsAppClient:
    """Async client for the Meta WhatsApp Cloud API.

    Each shop has its own access token and phone number ID,
    so a client instance is bound to a specific shop.
    """

    def __init__(self, access_token: str, phone_number_id: str) -> None:
        self.access_token = access_token
        self.phone_number_id = phone_number_id
        self.base_url = (
            f"{WHATSAPP_API_BASE}/{settings.whatsapp_api_version}"
            f"/{phone_number_id}"
        )

    # ── Low-level send ───────────────────────────────────────────────────

    async def _post(
        self, payload: dict[str, Any], retries: int = 1
    ) -> dict[str, Any] | None:
        """POST to /messages with optional retry."""
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }
        for attempt in range(retries + 1):
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(
                        f"{self.base_url}/messages",
                        headers=headers,
                        json=payload,
                    )
                    response.raise_for_status()
                    data: dict[str, Any] = response.json()
                    return data
            except httpx.HTTPStatusError as exc:
                logger.error(
                    "WhatsApp API HTTP error",
                    extra={
                        "status_code": exc.response.status_code,
                        "response_body": exc.response.text[:500],
                        "attempt": attempt + 1,
                    },
                )
                if attempt < retries:
                    continue
            except httpx.RequestError as exc:
                logger.error(
                    "WhatsApp API request failed",
                    extra={"error": str(exc), "attempt": attempt + 1},
                )
                if attempt < retries:
                    continue
            return None
        return None

    # ── Text message ─────────────────────────────────────────────────────

    async def send_message(self, to: str, text: str) -> dict[str, Any] | None:
        """Send a plain text WhatsApp message.

        Args:
            to: Recipient phone number (without + prefix).
            text: Message body text.

        Returns:
            API response dict on success, None on failure.
        """
        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": text},
        }
        data = await self._post(payload, retries=1)
        if data:
            logger.info(
                "WhatsApp message sent",
                extra={
                    "to": to,
                    "message_id": data.get("messages", [{}])[0].get("id"),
                },
            )
        return data

    # ── Image message ────────────────────────────────────────────────────

    async def send_image(
        self, to: str, image_url: str, caption: str = ""
    ) -> dict[str, Any] | None:
        """Send an image message via WhatsApp.

        Args:
            to: Recipient phone number.
            image_url: Public URL of the image.
            caption: Optional caption text below the image.

        Returns:
            API response dict on success, None on failure.
        """
        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "image",
            "image": {"link": image_url},
        }
        if caption:
            payload["image"]["caption"] = caption

        data = await self._post(payload)
        if data:
            logger.info(
                "WhatsApp image sent",
                extra={
                    "to": to,
                    "message_id": data.get("messages", [{}])[0].get("id"),
                },
            )
        return data

    # ── Interactive buttons ──────────────────────────────────────────────

    async def send_buttons(
        self,
        to: str,
        body_text: str,
        buttons: list[dict[str, str]],  # [{"id": "confirm", "title": "✅ Confirm"}]
    ) -> dict[str, Any] | None:
        """Send interactive buttons (max 3).

        Args:
            to: Recipient phone number.
            body_text: Message body text.
            buttons: List of dicts with "id" and "title" keys (max 3).

        Returns:
            API response dict on success, None on failure.
        """
        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body_text},
                "action": {
                    "buttons": [
                        {
                            "type": "reply",
                            "reply": {"id": b["id"], "title": b["title"][:20]},
                        }
                        for b in buttons[:3]
                    ]
                },
            },
        }
        data = await self._post(payload, retries=1)
        if data:
            logger.info(
                "WhatsApp buttons sent",
                extra={"to": to, "buttons": [b["id"] for b in buttons[:3]]},
            )
        return data

    # ── Interactive list ─────────────────────────────────────────────────

    async def send_list(
        self,
        to: str,
        body_text: str,
        button_text: str,
        sections: list[dict[str, Any]],  # [{"title": "Cakes", "rows": [{"id": "p1", "title": "Choco", "description": "₹450"}]}]
    ) -> dict[str, Any] | None:
        """Send an interactive list message (for catalog with >3 options).

        Args:
            to: Recipient phone number.
            body_text: Message body text.
            button_text: Text for the CTA button (e.g. "View Options").
            sections: List of section dicts with "title" and "rows".

        Returns:
            API response dict on success, None on failure.
        """
        # Truncate rows to 10 per section (Meta limit)
        for section in sections:
            section["rows"] = section.get("rows", [])[:10]

        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "list",
                "body": {"text": body_text},
                "action": {
                    "button": button_text[:20],
                    "sections": sections,
                },
            },
        }
        data = await self._post(payload, retries=1)
        if data:
            logger.info(
                "WhatsApp list sent",
                extra={"to": to, "sections": len(sections)},
            )
        return data

    # ── Template message ─────────────────────────────────────────────────

    async def send_template(
        self,
        to: str,
        template_name: str,
        components: list[dict[str, Any]] | None = None,
        lang: str = "en",
    ) -> dict[str, Any] | None:
        """Send a templated WhatsApp message.

        Args:
            to: Recipient phone number.
            template_name: Name of the registered WhatsApp template.
            components: Template component overrides.
            lang: Language code (default "en").

        Returns:
            API response dict on success, None on failure.
        """
        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": lang},
            },
        }
        if components:
            payload["template"]["components"] = components

        return await self._post(payload)

    # ── Media download + storage upload ──────────────────────────────────

    async def download_media(self, media_id: str) -> dict[str, Any] | None:
        """Download a media file from Meta and upload to Supabase Storage.

        Args:
            media_id: Meta media ID from the webhook payload.

        Returns:
            Dict with "url" (public URL) and "mime_type" on success, None on failure.
        """
        headers = {"Authorization": f"Bearer {self.access_token}"}
        try:
            # Step 1: Get media download URL
            async with httpx.AsyncClient(timeout=10.0) as client:
                url = f"{WHATSAPP_API_BASE}/{settings.whatsapp_api_version}/{media_id}"
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                media_info = resp.json()
                download_url: str = media_info.get("url", "")
                mime_type: str = media_info.get("mime_type", "image/jpeg")

            if not download_url:
                logger.error("No download URL in media response", extra={"media_id": media_id})
                return None

            # Step 2: Download the actual image bytes
            async with httpx.AsyncClient(timeout=30.0) as client:
                img_resp = await client.get(download_url, headers=headers)
                img_resp.raise_for_status()
                file_bytes = img_resp.content

            # Step 3: Upload to Supabase Storage
            ext = _ext_from_mime(mime_type)
            storage_path = f"media/{self.phone_number_id}/{media_id}{ext}"
            from uuid import uuid4
            storage_path = f"media/{self.phone_number_id}/{uuid4().hex}{ext}"

            public_url = await supabase.storage.upload(
                bucket="media",
                path=storage_path,
                file_data=file_bytes,
                content_type=mime_type,
                upsert=True,
            )

            if not public_url:
                logger.error("Failed to upload media to Supabase Storage", extra={"media_id": media_id})
                return None

            logger.info(
                "Media downloaded and uploaded to storage",
                extra={"media_id": media_id, "url": public_url, "mime_type": mime_type},
            )
            return {"url": public_url, "mime_type": mime_type}

        except httpx.HTTPStatusError as exc:
            logger.error(
                "Media download HTTP error",
                extra={"media_id": media_id, "status": exc.response.status_code},
            )
        except httpx.RequestError as exc:
            logger.error(
                "Media download request failed",
                extra={"media_id": media_id, "error": str(exc)},
            )
        return None


def _ext_from_mime(mime_type: str) -> str:
    """Map MIME type to file extension."""
    mapping = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "video/mp4": ".mp4",
        "video/3gp": ".3gp",
        "audio/ogg": ".ogg",
        "audio/mpeg": ".mp3",
    }
    return mapping.get(mime_type, ".bin")
