"""Shared authentication helpers for JWT verification.

Supports two auth methods (tried in order):
  1. Authorization: Bearer <Supabase JWT>    → shop lookup by owner_email
  2. X-API-Key <admin key>                   → unrestricted admin access

Shop-level X-API-Key has been removed — all shop auth is JWT-only.

Supported JWT algorithms:
  - HS256: verified locally with base64-decoded JWT secret
  - RS256/ES256: verified locally via JWKS public key, then falls back to
    Supabase Auth REST API (/auth/v1/user)

Used by app/main.py (direct endpoint definitions) and app/api/billing.py (router).
"""

from __future__ import annotations

import base64
import json
import time
from typing import Any
from uuid import UUID

import httpx
import jwt as pyjwt
from fastapi import HTTPException, Request

from app.config import settings
from app.database import supabase
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

# ── JWKS cache for RS256 / ES256 public key verification ────────────────

_jwks_keys: list[dict[str, Any]] = []
_jwks_cache_time: float = 0
JWKS_CACHE_TTL: int = 3600


# ── Key helpers ──────────────────────────────────────────────────────────


def _get_jwt_key() -> bytes:
    """Return the HMAC key for verifying HS256 Supabase JWTs.

    Supabase JWT secrets from the dashboard are base64-encoded strings.
    We base64-decode to get the raw bytes for HMAC verification.
    Falls back to raw UTF-8 bytes if decoding fails (older Supabase projects
    or manually-set plain-text secrets).
    """
    raw = settings.supabase_jwt_secret
    if not raw:
        return b""
    try:
        return base64.b64decode(raw)
    except Exception:
        return raw.encode("utf-8")


async def _get_jwks_public_keys() -> list[dict[str, Any]]:
    """Fetch and cache JWKS keys from Supabase for RS256/ES256 verification."""
    global _jwks_keys, _jwks_cache_time

    now = time.time()
    if _jwks_keys and (now - _jwks_cache_time) < JWKS_CACHE_TTL:
        return _jwks_keys

    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
        if resp.status_code == 200:
            data = resp.json()
            _jwks_keys = data.get("keys", [])
            _jwks_cache_time = now
            logger.info(f"Fetched {len(_jwks_keys)} JWKS key(s) from Supabase")
        else:
            logger.warning(f"JWKS endpoint returned {resp.status_code}")
    except Exception as exc:
        logger.warning(f"Failed to fetch JWKS: {exc}")

    return _jwks_keys


# ── Debug logging helpers ────────────────────────────────────────────────


def _debug_log_token(token: str) -> dict[str, Any] | None:
    """Decode and log JWT header/payload WITHOUT signature verification.

    Returns the payload dict (unverified) or None on failure.
    """
    try:
        header = pyjwt.get_unverified_header(token)
        payload = pyjwt.decode(token, options={"verify_signature": False})
    except Exception as exc:
        logger.error(f"Failed to parse JWT at all: {exc}")
        return None

    logger.info(f"JWT Header — alg={header.get('alg')} kid={header.get('kid')} typ={header.get('typ')}")
    logger.info(
        f"JWT Payload — aud={payload.get('aud')} sub={payload.get('sub')} "
        f"iss={payload.get('iss')} role={payload.get('role')}"
    )

    exp = payload.get("exp", 0)
    now = time.time()
    if exp:
        remaining = exp - now
        if remaining <= 0:
            logger.warning(f"Token is EXPIRED by {-remaining:.0f} seconds")
        else:
            logger.info(f"Token expires in {remaining:.0f} seconds")
    else:
        logger.info("Token has NO exp claim")

    logger.info(f"Token email: {payload.get('email', 'NOT PRESENT')}")
    return payload


# ── Main JWT verification ───────────────────────────────────────────────


async def verify_jwt_token(token: str) -> dict[str, str]:
    """Verify Supabase JWT token.

    Strategy (tried in order):
      1. Inspect token algorithm via unverified header.
      2. Local HS256 verification  (if alg == HS256) using JWT secret.
      3. Local RS256/ES256 verification (if alg == RS256/ES256) using JWKS.
      4. Fallback to Supabase Auth REST API  GET /auth/v1/user
    """
    # ── 0. Debug logging ────────────────────────────────────────────────
    logger.info(f"Token received (masked): {token[:20]}...{token[-10:]}")
    logger.info(f"Current server time: {time.time()}")
    logger.info(f"SUPABASE_URL: {settings.supabase_url}")
    logger.info(f"SUPABASE_ANON_KEY exists: {bool(settings.supabase_anon_key)}")
    logger.info(f"SUPABASE_JWT_SECRET exists: {bool(settings.supabase_jwt_secret)}")
    if settings.supabase_jwt_secret:
        logger.info(f"SUPABASE_JWT_SECRET length: {len(settings.supabase_jwt_secret)} chars")

    jwt_payload = _debug_log_token(token)

    # ── 1. Local verification ────────────────────────────────────────────
    if settings.supabase_jwt_secret and jwt_payload:
        try:
            alg = pyjwt.get_unverified_header(token).get("alg", "")
        except Exception:
            alg = ""

        if alg == "HS256":
            try:
                payload = pyjwt.decode(
                    token,
                    _get_jwt_key(),
                    audience="authenticated",
                    algorithms=["HS256"],
                )
                logger.info("Local HS256 verification: SUCCESS")
                user_email = payload.get("email")
                user_sub = payload.get("sub")
                if user_email and user_sub:
                    return {"auth_email": user_email, "auth_user_id": user_sub}
            except pyjwt.PyJWTError as exc:
                logger.info(f"Local HS256 verification failed: {exc}")

        elif alg in ("RS256", "ES256", "ES384", "EdDSA"):
            keys = await _get_jwks_public_keys()
            if keys:
                for jwk_key in keys:
                    try:
                        from jwt.algorithms import (
                            ECAlgorithm,
                            OKPAlgorithm,
                            RSAAlgorithm,
                        )

                        kty = jwk_key.get("kty", "")
                        jwk_json = json.dumps(jwk_key)

                        if kty == "RSA":
                            pub_key: Any = RSAAlgorithm.from_jwk(jwk_json)
                        elif kty == "EC":
                            pub_key = ECAlgorithm.from_jwk(jwk_json)
                        elif kty == "OKP":
                            pub_key = OKPAlgorithm.from_jwk(jwk_json)
                        else:
                            logger.info(f"Unsupported JWK key type: {kty} — skipping")
                            continue

                        key_alg = jwk_key.get("alg", alg)
                        payload = pyjwt.decode(
                            token,
                            pub_key,
                            audience="authenticated",
                            algorithms=[key_alg],
                        )
                        logger.info(f"Local {key_alg} verification: SUCCESS")
                        user_email = payload.get("email")
                        user_sub = payload.get("sub")
                        if user_email and user_sub:
                            return {"auth_email": user_email, "auth_user_id": user_sub}
                    except ImportError:
                        logger.info("'cryptography' not installed — skipping local RS256/ES256/EdDSA")
                        break
                    except pyjwt.PyJWTError as jwterr:
                        logger.info(f"JWKS key verification failed: {jwterr}")
                        continue
                logger.info(f"Local {alg} verification: FAILED (tried {len(keys)} JWKS key(s))")
            else:
                logger.info(f"No JWKS keys available — can't verify {alg} locally")
        else:
            logger.info(f"Algorithm '{alg}' — skipping local verification")

    # ── 2. Fallback to Supabase Auth REST API ────────────────────────────
    if not settings.supabase_url or not settings.supabase_anon_key:
        logger.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY for fallback")
        raise HTTPException(status_code=401, detail="Server not configured for authentication fallback")

    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": settings.supabase_anon_key,
    }

    logger.info(f"Fallback: GET {url}")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)

        logger.info(f"Supabase /auth/v1/user HTTP {resp.status_code}")
        logger.info(f"Supabase /auth/v1/user body: {resp.text[:500]}")

        if resp.status_code == 200:
            data = resp.json()
            user_id = data.get("id")
            email = data.get("email")
            if user_id and email:
                logger.info(f"Supabase API fallback: SUCCESS (email={email})")
                return {"auth_email": email, "auth_user_id": user_id}
            logger.warning(f"Supabase API returned 200 but missing id/email: {resp.text[:200]}")

        logger.warning(f"Supabase auth check FAILED | Status: {resp.status_code} | Response: {resp.text[:500]}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    except httpx.HTTPError as exc:
        logger.error(f"Supabase auth connection error: {exc}")
        raise HTTPException(status_code=500, detail="Authentication server unreachable")


async def get_current_user(request: Request) -> dict[str, str]:
    """Extract JWT payload from Authorization header.

    Returns dict with auth_email and auth_user_id,
    or raises 401 if JWT is missing/invalid.
    Does NOT look up a shop — use for endpoints that need the
    authenticated Supabase user identity regardless of shop.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header[len("Bearer "):]
    return await verify_jwt_token(token)


async def get_owned_resource(
    table_name: str,
    resource_id: str | UUID,
    shop_id: str | UUID,
    shop_id_column: str = "shop_id",
) -> dict[str, Any]:
    """Fetch a resource by id and verify it belongs to the given shop.

    Returns the resource dict on success.
    Raises 404 if not found, 403 if owned by a different shop.
    """
    try:
        result = (
            await supabase.table(table_name)
            .select("*")
            .eq("id", str(resource_id))
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    if result.data is None:
        raise HTTPException(status_code=404, detail=f"{table_name} not found")

    if str(result.data.get(shop_id_column)) != str(shop_id):
        raise HTTPException(status_code=403, detail="Access denied")

    return result.data


async def lookup_shop_by_owner_email(email: str) -> dict[str, Any] | None:
    """Look up a shop by owner_email. Returns None if not found or column missing."""
    try:
        result = (
            await supabase.table("shops")
            .select("*")
            .eq("owner_email", email)
            .maybe_single()
            .execute()
        )
        return result.data
    except Exception as exc:
        logger.warning("owner_email lookup failed", extra={"email": email, "error": str(exc)})
        return None


async def auth_by_jwt(request: Request) -> dict[str, Any] | None:
    """Authenticate via Authorization: Bearer <Supabase JWT>.

    Returns shop dict if a matching shop is found,
    returns {"auth_email": ..., "auth_user_id": ...} if JWT valid but no shop linked,
    returns None if JWT not present or invalid.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header[len("Bearer "):]
    try:
        user_info = await verify_jwt_token(token)
    except HTTPException:
        return None

    user_email = user_info["auth_email"]
    shop = await lookup_shop_by_owner_email(user_email)
    if shop:
        return shop

    # No shop linked to this user yet
    return {"auth_email": user_email, "auth_user_id": user_info["auth_user_id"]}


async def get_current_shop(request: Request) -> dict[str, Any] | None:
    """Authenticate request and return the current shop.

    Tries auth methods in order:
      1. Authorization: Bearer <Supabase JWT>  → shop by owner_email
      2. X-API-Key (admin key only)            → None (unrestricted)

    Returns shop dict, None (admin), or raises 401.
    """
    # 1) JWT Bearer token
    shop = await auth_by_jwt(request)
    if shop is not None:
        return shop

    # 2) Admin API key only (no shop-level keys)
    api_key = request.headers.get("X-API-Key", "")
    if settings.admin_api_key and api_key == settings.admin_api_key:
        return None

    raise HTTPException(status_code=401, detail="Invalid or missing authentication")


def verify_shop_access(shop: dict[str, Any] | None, shop_id: UUID) -> None:
    """Verify the authenticated shop matches the requested shop_id.

    Passes through for admin (shop is None).
    Raises 403 if the shop_id doesn't match.
    """
    if shop is None:
        return  # admin
    if str(shop_id) != str(shop["id"]):
        raise HTTPException(status_code=403, detail="Access denied")