"""Environment-backed settings for the monitoring container."""

from __future__ import annotations

import os

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
HTTPX_LOG_LEVEL = os.environ.get("HTTPX_LOG_LEVEL", "WARNING").upper()

FACILITY_ID = os.environ.get("FACILITY_ID", "")
APP_URL = os.environ.get("APP_URL", "http://localhost:3000")
SERVER_SECRET = os.environ.get("SERVER_SECRET", "")

API_BASE = f"{APP_URL}/api/facility/{FACILITY_ID}/monitoring"
AUTH_HEADER = {"Authorization": f"Bearer {SERVER_SECRET}"}
CONFIG_READY = bool(FACILITY_ID and SERVER_SECRET)

# Tuning — these are fallback defaults only.
# Per-CCTV capture settings from the frontend always take precedence.
SEGMENT_DURATION_SEC = 30  # actual segment length in ffmpeg (default)
HEARTBEAT_INTERVAL_SEC = 120  # post monitoring:heartbeat every 2 min
HTTP_TIMEOUT_SEC = 30

# Simulator base URL (single host serving the API and HLS).
# When running inside a Cloudflare Container, the Worker passes this as an
# environment variable pointing at the Fly.io deployment.
SIMULATOR_URL = os.environ.get("SIMULATOR_URL", "http://localhost:3002")

# Legacy compat — keep fallback list for resilience
SIMULATION_SENSOR_API_FALLBACKS = os.environ.get(
    "SIMULATION_SENSOR_API_FALLBACKS",
    "http://localhost:3002,http://host.docker.internal:3002,http://facilix-simulator:8000,"
    "http://172.17.0.1:3002,http://172.19.0.1:3002",
)
