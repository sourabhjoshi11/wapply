"""Simple in-memory sliding window rate limiter.

No external dependencies — uses a dict of namespace → key → [timestamps].
Thread-safe for async use (single event loop).
"""

from __future__ import annotations

import time
from collections import defaultdict


class RateLimiter:
    """Sliding-window rate limiter with per-namespace counters."""

    def __init__(self) -> None:
        self._stores: dict[str, dict[str, list[float]]] = defaultdict(
            lambda: defaultdict(list)
        )

    def _clean(self, store: dict[str, list[float]], key: str, window: float) -> None:
        now = time.time()
        store[key] = [t for t in store[key] if now - t < window]

    def check(
        self,
        key: str,
        max_attempts: int,
        window_seconds: float,
        namespace: str = "default",
    ) -> bool:
        """Return True if request is allowed, False if rate-limited."""
        now = time.time()
        store = self._stores[namespace]
        self._clean(store, key, window_seconds)
        if len(store[key]) >= max_attempts:
            return False
        store[key].append(now)
        return True

    def remaining(
        self,
        key: str,
        max_attempts: int,
        window_seconds: float,
        namespace: str = "default",
    ) -> int:
        """Return how many more attempts are allowed in the current window."""
        store = self._stores[namespace]
        self._clean(store, key, window_seconds)
        return max(0, max_attempts - len(store[key]))


# Module-level singleton
rate_limiter = RateLimiter()
