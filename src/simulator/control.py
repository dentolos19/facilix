"""Authentication dependencies for simulator control endpoints."""

from __future__ import annotations

import hmac

import fastapi

import config


async def require_token(request: fastapi.Request) -> None:
    """Require the server-side token before changing simulator state."""
    if not config.SIMULATOR_TOKEN:
        raise fastapi.HTTPException(status_code=503, detail="Simulator controls are not configured")

    authorization = request.headers.get("Authorization", "")
    expected = f"Bearer {config.SIMULATOR_TOKEN}"
    if not hmac.compare_digest(authorization, expected):
        raise fastapi.HTTPException(status_code=401, detail="Invalid simulator token")
