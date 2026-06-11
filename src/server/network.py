"""Network and stream URL helpers."""

from __future__ import annotations

import asyncio
import logging
import os
from urllib.parse import urlparse

net_log = logging.getLogger("facilix.net")


def detect_default_gateway() -> str | None:
    """Return the container's IPv4 default gateway by reading /proc/net/route, or None."""
    try:
        with open("/proc/net/route") as f:
            next(f)  # skip header
            for line in f:
                fields = line.strip().split()
                # Default route has destination 0.0.0.0 (hex 00000000)
                if len(fields) >= 3 and fields[1] == "00000000":
                    gw_hex = fields[2]
                    # /proc/net/route stores gateway IPs little-endian
                    octets = [int(gw_hex[i : i + 2], 16) for i in (6, 4, 2, 0)]
                    return ".".join(str(o) for o in octets)
    except OSError:
        return None
    return None


_detected_gateway = detect_default_gateway()
CCTV_STREAM_HOST_REWRITE = os.environ.get("CCTV_STREAM_HOST_REWRITE") or _detected_gateway or "172.17.0.1"


def log_stream_rewrite_config() -> None:
    """Log the configured target used to rewrite localhost stream URLs."""
    logging.getLogger("facilix").info(
        "CCTV stream host rewrite target: %s (env=%r, detected_gateway=%r)",
        CCTV_STREAM_HOST_REWRITE,
        os.environ.get("CCTV_STREAM_HOST_REWRITE"),
        _detected_gateway,
    )


def rewrite_stream_host(stream_url: str) -> str:
    """Replace localhost / 127.0.0.1 in a stream URL with the configured host gateway."""
    if not stream_url or not CCTV_STREAM_HOST_REWRITE:
        return stream_url
    for needle in ("://localhost", "://127.0.0.1"):
        if needle in stream_url:
            return stream_url.replace(needle, f"://{CCTV_STREAM_HOST_REWRITE}", 1)
    return stream_url


def ffmpeg_input_options(stream_url: str) -> list[str]:
    """Return ffmpeg options that must be placed before the input URL."""
    parsed = urlparse(stream_url)
    if parsed.scheme.lower() == "rtsp":
        # RTSP's control TCP port can be reachable while its default UDP RTP
        # media ports are blocked by Docker NAT/firewalls. Interleaving media
        # over the RTSP TCP connection makes host-published simulator streams
        # work from inside the monitoring container.
        return ["-rtsp_transport", "tcp"]
    return []


async def probe_tcp(host: str, port: int, timeout: float = 3.0) -> tuple[bool, str]:
    """TCP-connect to host:port — returns (ok, detail). Used at startup to confirm reachability."""
    try:
        fut = asyncio.open_connection(host, port)
        _reader, writer = await asyncio.wait_for(fut, timeout=timeout)
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return True, "ok"
    except TimeoutError:
        return False, "timeout"
    except OSError as exc:
        return False, f"{type(exc).__name__}: {exc}"
    except Exception as exc:  # pragma: no cover — defensive
        return False, f"{type(exc).__name__}: {exc}"


async def probe_stream_url(stream_url: str) -> None:
    """Log whether the resolved stream URL is even TCP-reachable. Cheap sanity check."""
    parsed = urlparse(stream_url)
    if not parsed.hostname:
        net_log.warning("stream URL has no hostname: %s", stream_url)
        return
    # RTSP default port is 554; HLS over HTTP is 80/443
    default_port = {"rtsp": 554, "rtmp": 1935, "http": 80, "https": 443}.get(parsed.scheme, 0)
    port = parsed.port or default_port
    if not port:
        net_log.warning("could not determine port for %s", stream_url)
        return
    ok, detail = await probe_tcp(parsed.hostname, port)
    if ok:
        net_log.info("TCP probe OK: %s:%d (%s)", parsed.hostname, port, stream_url)
    else:
        net_log.error("TCP probe FAILED: %s:%d — %s (url=%s)", parsed.hostname, port, detail, stream_url)
