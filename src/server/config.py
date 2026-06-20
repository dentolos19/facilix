"""Environment-backed settings for the monitoring container."""

from __future__ import annotations

import os

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
HTTPX_LOG_LEVEL = os.environ.get("HTTPX_LOG_LEVEL", "WARNING").upper()

FACILITY_ID = os.environ.get("FACILITY_ID", "")
APP_ORIGIN = os.environ.get("APP_ORIGIN", "http://localhost:3000")
INGEST_TOKEN = os.environ.get("INGEST_TOKEN", "")

API_BASE = f"{APP_ORIGIN}/api/facility/{FACILITY_ID}/monitoring"
AUTH_HEADER = {"Authorization": f"Bearer {INGEST_TOKEN}"}
CONFIG_READY = bool(FACILITY_ID and INGEST_TOKEN)

# Tuning — these are fallback defaults only.
# Per-CCTV capture settings from the frontend always take precedence.
SEGMENT_DURATION_SEC = 30  # actual segment length in ffmpeg (default)
HEARTBEAT_INTERVAL_SEC = 120  # post monitoring:heartbeat every 2 min
HTTP_TIMEOUT_SEC = 30

# Simulation endpoints (local dev via docker-compose).
# When this service runs on the host, localhost works. When it runs inside a
# container, localhost points at the monitoring container itself, so allow an
# override and try common Docker host gateway fallbacks.
SIMULATION_CCTV_API = os.environ.get("SIMULATION_CCTV_API", "http://localhost:3002")
SIMULATION_HLS_BASE = os.environ.get("SIMULATION_HLS_BASE", "http://localhost:3005")
SIMULATION_SENSOR_API = os.environ.get("SIMULATION_SENSOR_API", "http://localhost:3002")
SIMULATION_SENSOR_API_FALLBACKS = os.environ.get(
    "SIMULATION_SENSOR_API_FALLBACKS",
    "http://localhost:3002,http://host.docker.internal:3002,http://facilix-simulator:8000,"
    "http://172.17.0.1:3002,http://172.19.0.1:3002",
)
