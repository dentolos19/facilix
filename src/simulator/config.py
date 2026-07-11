"""Configuration for the unified simulator."""

from __future__ import annotations

import os

# ---------------------------------------------------------------------------
# Samples — the single override point for the sample directory.
# Everything else is derived from this or hard-coded.
# ---------------------------------------------------------------------------

SAMPLES_DIR = "/app/samples"
VIDEOS_MANIFEST = os.path.join(SAMPLES_DIR, "videos.json")

# ---------------------------------------------------------------------------
# MediaMTX (internal — these addresses never change because all three
# processes run side-by-side inside the same container)
# ---------------------------------------------------------------------------

MEDIAMTX_HOST = "localhost"
MEDIAMTX_RTSP_PORT = 8554
MEDIAMTX_RTMP_PORT = 1935
MEDIAMTX_HLS_URL = "http://localhost:8888"

# While low-latency HLS is assembling the first segment the endpoint can
# block; this is the fetch timeout for the proxy.
MEDIAMTX_HLS_TIMEOUT_SECONDS = 30

# ---------------------------------------------------------------------------
# CCTV health
# ---------------------------------------------------------------------------

HEALTH_CHECK_INTERVAL = 15

FALLBACK_ENCODE_ARGS = [
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency",
    "-c:a",
    "aac",
]

# ---------------------------------------------------------------------------
# Sensors — all default values are code-owned constants.
# ---------------------------------------------------------------------------

SENSOR_DEFAULT_INTERVAL_SECONDS = 5
SENSOR_HISTORY_LIMIT = 500
SENSOR_PAYLOAD_FORMAT = "facilix"

# Fixed seed for repeatable random values across restarts (optional).
RANDOM_SEED: int | None = None
_seed_raw = os.environ.get("SENSOR_RANDOM_SEED")
if _seed_raw is not None:
    RANDOM_SEED = int(_seed_raw)

# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------

LOG_LEVEL = "info"

# Comma-separated origins allowed to call the simulator from a browser.
DEFAULT_CORS_ORIGINS = "http://localhost:3000,http://localhost:3001,http://localhost:5173,https://local.dennise.me,https://facilix.dennise.me"
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("SIMULATOR_CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]
