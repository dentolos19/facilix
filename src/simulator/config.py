"""Configuration for the unified simulator."""

from __future__ import annotations

import os

# ---------------------------------------------------------------------------
# CCTV / MediaMTX
# ---------------------------------------------------------------------------

# Directory mounted from host containing MP4 video files
VIDEOS_DIR = os.environ.get("SIMULATOR_VIDEOS_DIR", "/videos")

# Directory containing the samples manifest (videos.json)
SAMPLES_DIR = os.environ.get("SIMULATOR_SAMPLES_DIR", "/samples")

# Path to the video manifest JSON
VIDEOS_MANIFEST = os.environ.get("SIMULATOR_VIDEOS_MANIFEST", "/samples/videos.json")

# MediaMTX hostname (container name in compose, localhost when bundled)
MEDIAMTX_HOST = os.environ.get("MEDIAMTX_HOST", "localhost")

# RTSP target port inside MediaMTX
MEDIAMTX_RTSP_PORT = int(os.environ.get("MEDIAMTX_RTSP_PORT", "8554"))

# RTMP target port inside MediaMTX
MEDIAMTX_RTMP_PORT = int(os.environ.get("MEDIAMTX_RTMP_PORT", "1935"))

# Browser-facing HLS endpoint served by bundled MediaMTX.
MEDIAMTX_HLS_URL = os.environ.get("MEDIAMTX_HLS_URL", "http://localhost:8888")

# Low-latency HLS can block while MediaMTX waits for parts to become available.
MEDIAMTX_HLS_TIMEOUT_SECONDS = int(os.environ.get("MEDIAMTX_HLS_TIMEOUT_SECONDS", "30"))

# How often to check whether FFmpeg processes are alive (seconds)
HEALTH_CHECK_INTERVAL = int(os.environ.get("SIMULATOR_HEALTH_CHECK_INTERVAL", "15"))

# Fallback encode args if stream copy fails
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
# Sensors
# ---------------------------------------------------------------------------

# Default interval between automatic reading generations (seconds)
SENSOR_DEFAULT_INTERVAL_SECONDS = int(os.environ.get("SENSOR_DEFAULT_INTERVAL_SECONDS", "5"))

# Maximum number of historical readings to keep per sensor
SENSOR_HISTORY_LIMIT = int(os.environ.get("SENSOR_HISTORY_LIMIT", "500"))

# Fixed seed for repeatable random values across restarts (optional)
RANDOM_SEED = os.environ.get("SENSOR_RANDOM_SEED", None)
if RANDOM_SEED is not None:
    RANDOM_SEED = int(RANDOM_SEED)

# Payload format: "facilix" (default), "thingsboard", or "senml"
SENSOR_PAYLOAD_FORMAT = os.environ.get("SENSOR_PAYLOAD_FORMAT", "facilix")

# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------

# Comma-separated origins allowed to call the simulator from a browser.
DEFAULT_CORS_ORIGINS = "http://localhost:3000,http://localhost:3001,http://localhost:5173,https://local.dennise.me,https://facilix.dennise.me"
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("SIMULATOR_CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]

# Log level for the app
LOG_LEVEL = os.environ.get("SIMULATOR_LOG_LEVEL", "info")
