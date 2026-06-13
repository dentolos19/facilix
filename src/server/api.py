"""Worker monitoring API client helpers."""

from __future__ import annotations

import logging
import time
from typing import Any

from config import API_BASE, AUTH_HEADER
from utils import get_http_client, now_iso

log = logging.getLogger("facilix")
cctv_log = logging.getLogger("facilix.cctv")


async def post_event(
    device_id: str,
    event_type: str,
    severity: str,
    message: str,
    extra: dict[str, Any] | None = None,
) -> bool:
    """POST an event to the Worker events endpoint."""
    payload = {
        "deviceId": device_id,
        "type": event_type,
        "severity": severity,
        "message": message,
        "data": extra or {},
    }
    try:
        client = get_http_client()
        t0 = time.monotonic()
        resp = await client.post(
            f"{API_BASE}/events",
            headers=AUTH_HEADER,
            json=payload,
        )
        dt_ms = (time.monotonic() - t0) * 1000
        if resp.status_code != 200:
            log.warning(
                "post_event %s/%s failed: HTTP %d in %.0fms — %s",
                event_type,
                device_id,
                resp.status_code,
                dt_ms,
                resp.text[:200],
            )
            return False
        log.debug("post_event %s/%s ok in %.0fms", event_type, device_id, dt_ms)
        return True
    except Exception as exc:
        log.exception("post_event %s/%s error: %s", event_type, device_id, exc)
        return False


async def fetch_config() -> dict[str, Any] | None:
    """Fetch facility monitoring configuration from the Worker."""
    url = f"{API_BASE}/config"
    log.info("fetch_config GET %s", url)
    try:
        client = get_http_client()
        t0 = time.monotonic()
        resp = await client.get(url, headers=AUTH_HEADER)
        dt_ms = (time.monotonic() - t0) * 1000
        if resp.status_code == 200:
            data = resp.json()
            log.info(
                "fetch_config ok in %.0fms — %d cctv, %d sensors",
                dt_ms,
                len(data.get("cctv", [])),
                len(data.get("sensors", [])),
            )
            return data
        log.warning("fetch_config failed: HTTP %d in %.0fms — %s", resp.status_code, dt_ms, resp.text[:200])
        return None
    except Exception as exc:
        log.exception("fetch_config error: %s", exc)
        return None


async def upload_frame(device_id: str, frame_data: bytes, seq: int = 0, captured_at: float = 0) -> None:
    """POST a sampled frame to the Worker frames endpoint."""
    idem_key = f"{device_id}-frame-{seq}" if seq else f"{device_id}-frame-{int(time.time())}"
    url = f"{API_BASE}/frames"
    captured_iso = now_iso(captured_at) if captured_at else now_iso()

    cctv_log.debug("upload_frame -> %s (idem=%s, %dB, seq=%d)", url, idem_key, len(frame_data), seq)
    try:
        client = get_http_client()
        t0 = time.monotonic()
        resp = await client.post(
            url,
            headers={
                **AUTH_HEADER,
                "X-Device-Id": device_id,
                "Content-Type": "image/jpeg",
                "Idempotency-Key": idem_key,
                "X-Sequence": str(seq),
                "X-Captured-At": captured_iso,
            },
            content=frame_data,
        )
        dt_ms = (time.monotonic() - t0) * 1000
        if resp.status_code != 200:
            cctv_log.warning("upload_frame HTTP %d in %.0fms: %s", resp.status_code, dt_ms, resp.text[:200])
        else:
            cctv_log.info("upload_frame ok in %.0fms — %s", dt_ms, resp.text[:200])
    except Exception as exc:
        cctv_log.exception("upload_frame error: %s", exc)


async def upload_segment(
    device_id: str,
    segment_data: bytes,
    duration: float,
    seq: int = 0,
    started_at: float = 0,
    ended_at: float = 0,
) -> None:
    """POST a video segment to the Worker segments endpoint."""
    idem_key = f"{device_id}-segment-{seq}" if seq else f"{device_id}-segment-{int(time.time())}"
    url = f"{API_BASE}/segments"
    started_iso = now_iso(started_at) if started_at else now_iso()
    ended_iso = now_iso(ended_at) if ended_at else now_iso()

    cctv_log.info(
        "upload_segment -> %s (idem=%s, %.1fMB, %.1fs)",
        url,
        idem_key,
        len(segment_data) / (1024 * 1024),
        duration,
    )
    try:
        client = get_http_client()
        t0 = time.monotonic()
        resp = await client.post(
            url,
            headers={
                **AUTH_HEADER,
                "X-Device-Id": device_id,
                "Content-Type": "video/mp4",
                "X-Duration-Sec": str(int(duration)),
                "X-Started-At": started_iso,
                "X-Ended-At": ended_iso,
                "X-Sequence": str(seq),
                "Idempotency-Key": idem_key,
            },
            content=segment_data,
        )
        dt_ms = (time.monotonic() - t0) * 1000
        if resp.status_code != 200:
            cctv_log.warning("upload_segment HTTP %d in %.0fms: %s", resp.status_code, dt_ms, resp.text[:200])
        else:
            cctv_log.info("upload_segment ok in %.0fms — %s", dt_ms, resp.text[:200])
    except Exception as exc:
        cctv_log.exception("upload_segment error: %s", exc)
