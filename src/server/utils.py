"""Shared utilities: time helpers, HTTP client lifecycle, logging setup."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

from config import HTTP_TIMEOUT_SEC, HTTPX_LOG_LEVEL, LOG_LEVEL
from logs import configure_logging as _configure_logging

# ---------------------------------------------------------------------------
# Time
# ---------------------------------------------------------------------------


def now_iso(ts: float | None = None) -> str:
    """Return a UTC timestamp as an ISO 8601 string.

    If ``ts`` is given (seconds since epoch), converts that; otherwise current time.
    """
    if ts is not None:
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------

_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return the process-wide async HTTP client."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(HTTP_TIMEOUT_SEC))
    return _client


async def close_http_client() -> None:
    """Close the process-wide async HTTP client if it was created."""
    global _client
    if _client:
        await _client.aclose()
        _client = None


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------


def configure_logging() -> None:
    """Configure structured JSON logging and quiet noisy upstream libraries."""
    _configure_logging(LOG_LEVEL)
    logging.getLogger("httpx").setLevel(HTTPX_LOG_LEVEL)
    logging.getLogger("httpcore").setLevel("WARNING")
