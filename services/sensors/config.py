"""Configuration for the IoT sensor simulator."""

import os

# HTTP port the service listens on
SENSORS_PORT = int(os.environ.get("SENSORS_PORT", "8010"))

# Log level
LOG_LEVEL = os.environ.get("SENSORS_LOG_LEVEL", "info")

# Default interval between automatic reading generations (seconds)
DEFAULT_INTERVAL_SECONDS = int(
    os.environ.get("SENSOR_DEFAULT_INTERVAL_SECONDS", "5")
)

# Maximum number of historical readings to keep per sensor
HISTORY_LIMIT = int(os.environ.get("SENSOR_HISTORY_LIMIT", "500"))

# Fixed seed for repeatable random values across restarts (optional)
RANDOM_SEED = os.environ.get("SENSOR_RANDOM_SEED", None)
if RANDOM_SEED is not None:
    RANDOM_SEED = int(RANDOM_SEED)

# Payload format: "facilix" (default), "thingsboard", or "senml"
PAYLOAD_FORMAT = os.environ.get("SENSOR_PAYLOAD_FORMAT", "facilix")
