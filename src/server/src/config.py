"""Environment-backed settings for the monitoring container."""

from __future__ import annotations

import os

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
HTTPX_LOG_LEVEL = os.environ.get("HTTPX_LOG_LEVEL", "WARNING").upper()

FACILITY_ID = os.environ.get("FACILITY_ID", "")
MONITORING_API_URL = os.environ.get("MONITORING_API_URL", "http://localhost:3000/api/facility/local/monitoring")
MONITORING_TOKEN = os.environ.get("MONITORING_TOKEN", "")

API_BASE = MONITORING_API_URL.rstrip("/")
AUTH_HEADER = {"Authorization": f"Bearer {MONITORING_TOKEN}"}
CONFIG_READY = bool(FACILITY_ID and MONITORING_API_URL and MONITORING_TOKEN)

# Tuning — these are fallback defaults only.
# Per-CCTV capture settings from the frontend always take precedence.
SEGMENT_DURATION_SEC = 30  # actual segment length in ffmpeg (default)
HEARTBEAT_INTERVAL_SEC = 120  # post monitoring:heartbeat every 2 min
HTTP_TIMEOUT_SEC = 30

# Simulator base URL (single host serving the API and HLS).
# The Worker passes the public simulator proxy URL to each monitoring container.
SIMULATOR_URL = os.environ.get("SIMULATOR_URL", "http://localhost:3000")

# Legacy compat — keep fallback list for resilience
SIMULATION_SENSOR_API_FALLBACKS = os.environ.get(
    "SIMULATION_SENSOR_API_FALLBACKS",
    "http://localhost:3000,http://host.docker.internal:3000,http://facilix-simulator:3000,"
    "http://172.17.0.1:3000,http://172.19.0.1:3000",
)
