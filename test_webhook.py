"""Webhook test tool — simulate Meta WhatsApp payloads locally.

Usage:
  python test_webhook.py --verify                          # Test GET verification
  python test_webhook.py --send --text "1"                 # Send "1" as customer 15551234567
  python test_webhook.py --send --text "1 x2" --from "9199999999"
  python test_webhook.py --flow                            # Full ordering flow
  python test_webhook.py --send --text "1" --shop-id       # Use /webhook/{shop_id} route
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import sys
import time
import urllib.request
import urllib.error
from typing import Any

# ── Bootstrap: load .env + settings before any app imports ──────────────────
from dotenv import load_dotenv

load_dotenv()

from app.config import settings
from app.database import supabase
from app.utils.logger import setup_logger

logger = setup_logger("test_webhook")

# ── Helpers ─────────────────────────────────────────────────────────────────

BASE_URL = "http://localhost:8000"
DEFAULT_FROM = "15551234567"
DEFAULT_CUSTOMER_NAME = "Test User"


def get_first_shop() -> dict[str, Any] | None:
    """Fetch the first active shop from Supabase."""
    try:
        result = supabase.table("shops").select("*").eq("active", True).limit(1).execute()
        if result.data:
            return result.data[0]
    except Exception as exc:
        print(f"  [ERROR] Failed to query shops: {exc}")
    return None


def build_payload(
    phone_number_id: str,
    display_phone_number: str,
    from_number: str,
    text: str,
    msg_id: str = "wamid.test",
) -> dict[str, Any]:
    """Build a Meta-style webhook payload."""
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": phone_number_id,
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": display_phone_number,
                                "phone_number_id": phone_number_id,
                            },
                            "contacts": [
                                {
                                    "profile": {"name": DEFAULT_CUSTOMER_NAME},
                                    "wa_id": from_number,
                                }
                            ],
                            "messages": [
                                {
                                    "from": from_number,
                                    "id": msg_id,
                                    "timestamp": str(int(time.time())),
                                    "type": "text",
                                    "text": {"body": text},
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }


def sign_payload(payload: bytes, secret: str) -> str:
    """Generate X-Hub-Signature-256."""
    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return f"sha256={expected}"


def print_payload(body: dict[str, Any]) -> None:
    """Pretty-print the outgoing payload (brief)."""
    try:
        msg = body["entry"][0]["changes"][0]["value"]["messages"][0]
        print(f"  From: {msg['from']}")
        print(f"  Text: {msg['text']['body']}")
    except (KeyError, IndexError):
        pass


def do_get_verify(base: str, verify_token: str) -> bool:
    """Test GET /webhook verification."""
    url = f"{base}/webhook?hub.mode=subscribe&hub.challenge=98765&hub.verify_token={verify_token}"
    print(f"\n[GET] {url}")
    print(f"  Expected challenge: 98765")
    try:
        req = urllib.request.Request(url)
        resp = urllib.request.urlopen(req, timeout=10)
        body = resp.read().decode()
        status = resp.status
        print(f"  Response {status}: {body}")
        if body == "98765":
            print(f"  [PASS] Verification OK -- challenge returned")
            return True
        else:
            print(f"  [FAIL] Got '{body}' instead of '98765'")
            return False
    except urllib.error.HTTPError as exc:
        print(f"  [ERROR] HTTP {exc.code}: {exc.read().decode()}")
        return False


def do_post_message(
    base: str,
    endpoint: str,
    payload: dict[str, Any],
    secret: str,
    verbose: bool,
) -> bool:
    """POST a simulated webhook message."""
    url = f"{base}{endpoint}"
    body_bytes = json.dumps(payload).encode("utf-8")
    signature = sign_payload(body_bytes, secret)

    print(f"\n[POST] {url}")
    print_payload(payload)

    req = urllib.request.Request(
        url,
        data=body_bytes,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": signature,
        },
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        body = resp.read().decode()
        status = resp.status
        print(f"  Response {status}: {body}")
        if status == 200:
            print(f"  [PASS] Message accepted")
            return True
        print(f"  [WARN] Unexpected status")
        return False
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode()
        print(f"  [ERROR] HTTP {exc.code}: {err_body}")
        return False


def run_flow(
    base: str,
    shop: dict[str, Any],
    secret: str,
    from_number: str,
    use_shop_id: bool,
    verbose: bool,
) -> None:
    """Simulate a complete ordering conversation."""
    phone_id = shop["phone_number_id"]
    display_number = shop["whatsapp_number"]
    endpoint = f"/webhook/{shop['id']}" if use_shop_id else "/webhook"

    steps = [
        ("Greeting -- pick category 1", "1"),
        ("Add product 1 x2", "1 x2"),
        ("Add product 2 x1", "2 x1"),
        ("Checkout -- C", "C"),
        ("Confirm order -- Y", "Y"),
        ("Enter address", "123 Test Street, Bangalore"),
        ("Choose payment -- COD", "COD"),
    ]

    print(f"\n{'=' * 50}")
    print(f"[FLOW] Full Ordering Flow -- {shop['name']}")
    print(f"   Customer: {from_number}")
    print(f"   Route: {endpoint}")
    print(f"{'=' * 50}")

    for i, (label, text) in enumerate(steps, start=1):
        print(f"\n--- Step {i}/{len(steps)}: {label} ---")
        payload = build_payload(
            phone_number_id=phone_id,
            display_phone_number=display_number,
            from_number=from_number,
            text=text,
            msg_id=f"wamid.test.{i}",
        )
        ok = do_post_message(base, endpoint, payload, secret, verbose)
        if not ok:
            print(f"\n  [STOP] Flow stopped at step {i}")
            return
        time.sleep(0.3)  # small delay between messages

    print(f"\n{'=' * 50}")
    print(f"[DONE] Flow complete -- check server logs for details")
    print(f"{'=' * 50}")


# ── Main ────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Test Meta WhatsApp webhooks locally",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--url", default=BASE_URL, help="Server base URL")
    parser.add_argument("--from", dest="from_number", default=DEFAULT_FROM, help="Sender number")
    parser.add_argument("--verbose", action="store_true", help="Show full payloads")

    # Modes
    parser.add_argument("--verify", action="store_true", help="Test GET webhook verification")
    parser.add_argument("--send", action="store_true", help="Send a single message (default if --text given)")
    parser.add_argument("--flow", action="store_true", help="Run full ordering flow")
    parser.add_argument("--shop-id", action="store_true", help="Use /webhook/{shop_id} route")
    parser.add_argument("--text", help="Message text to send")

    args = parser.parse_args()

    # ── Resolve shop ─────────────────────────────────────────────────
    shop = get_first_shop()
    if not shop:
        print("[ERROR] No active shop found in Supabase. Seed one first.")
        sys.exit(1)

    print(f"[INFO] Shop: {shop['name']} ({shop['id']})")
    print(f"[INFO] Phone number ID: {shop['phone_number_id']}")
    print(f"[INFO] Verify token: {settings.whatsapp_verify_token or '(not set)'}")
    print(f"  META_APP_SECRET: {'[SET]' if settings.meta_app_secret else '[MISSING]'}")
    print(f"  SUPABASE: {'[CONNECTED]' if shop else '[FAILED]'}")

    secret = settings.meta_app_secret
    base = args.url.rstrip("/")

    # ── Mode dispatch ────────────────────────────────────────────────
    mode = "flow" if args.flow else "verify" if args.verify else "send"

    if mode == "verify":
        if not settings.whatsapp_verify_token:
            print("[ERROR] WHATSAPP_VERIFY_TOKEN not set in .env")
            sys.exit(1)
        ok = do_get_verify(base, settings.whatsapp_verify_token)
        sys.exit(0 if ok else 1)

    if mode == "send":
        text = args.text
        if not text:
            print("[ERROR] Use --text to specify the message, or --flow for auto flow, or --verify for GET test")
            parser.print_help()
            sys.exit(1)

        phone_id = shop["phone_number_id"]
        display_number = shop["whatsapp_number"]
        endpoint = f"/webhook/{shop['id']}" if args.shop_id else "/webhook"

        payload = build_payload(
            phone_number_id=phone_id,
            display_phone_number=display_number,
            from_number=args.from_number,
            text=text,
        )
        if args.verbose:
            print(f"\n[PAYLOAD]\n{json.dumps(payload, indent=2)}")

        ok = do_post_message(base, endpoint, payload, secret, args.verbose)
        sys.exit(0 if ok else 1)

    if mode == "flow":
        run_flow(
            base=base,
            shop=shop,
            secret=secret,
            from_number=args.from_number,
            use_shop_id=args.shop_id,
            verbose=args.verbose,
        )


if __name__ == "__main__":
    main()
