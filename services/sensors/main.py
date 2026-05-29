"""IoT Sensor Simulator — FastAPI application.

Generates realistic telemetry readings for virtual facility sensors
(temperature, humidity, pressure, light, motion, air quality, etc.)
and serves them over HTTP.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Dict, List, Optional

import fastapi
import uvicorn
from fastapi.responses import JSONResponse

import config
from models import SensorReading, SensorDevice
import sensors

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sensor-api")

# ---------------------------------------------------------------------------
# Background reading loop
# ---------------------------------------------------------------------------

_read_task: Optional[asyncio.Task] = None
_shutdown_event = asyncio.Event()


async def _read_loop() -> None:
    """Periodically generate readings for all enabled sensors."""
    interval = config.DEFAULT_INTERVAL_SECONDS
    while not _shutdown_event.is_set():
        start = asyncio.get_event_loop().time()
        gen = sensors.generate_readings()
        if gen:
            logger.debug("Generated %d sensor reading(s)", len(gen))
        elapsed = asyncio.get_event_loop().time() - start
        wait = max(0.0, interval - elapsed)
        try:
            await asyncio.wait_for(_shutdown_event.wait(), timeout=wait)
        except asyncio.TimeoutError:
            pass


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    """Start the background reading loop on startup, cancel on shutdown."""
    global _read_task
    sensors.init()
    _read_task = asyncio.create_task(_read_loop())
    logger.info(
        "Sensor simulator started (interval=%ds, format=%s)",
        config.DEFAULT_INTERVAL_SECONDS,
        config.PAYLOAD_FORMAT,
    )
    yield
    _shutdown_event.set()
    if _read_task is not None:
        _read_task.cancel()
        try:
            await _read_task
        except asyncio.CancelledError:
            pass
    logger.info("Sensor simulator stopped")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = fastapi.FastAPI(
    title="IoT Sensor Simulator",
    description=(
        "Generates realistic facility-sensor telemetry (temperature, humidity, "
        "pressure, light, motion, air quality, leak, vibration, door contact, "
        "battery) and exposes it over HTTP. Payload format is configurable."
    ),
    version="0.1.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> JSONResponse:
    """Basic health check."""
    total = len(sensors.get_devices())
    online = sum(
        1 for d in sensors.get_devices() if d.status.value in ("ok", "degraded")
    )
    return JSONResponse(
        {
            "status": "ok" if online == total else "degraded",
            "sensors": {"total": total, "online": online},
        }
    )


@app.get("/sensors")
async def list_sensors() -> JSONResponse:
    """List all configured sensor devices."""
    devices = sensors.get_devices()
    return JSONResponse(
        {
            "sensors": [
                {
                    "deviceId": d.device_id,
                    "sensorType": d.sensor_type.value,
                    "label": d.label,
                    "status": d.status.value,
                    "enabled": sensors.is_enabled(d.device_id),
                    "batteryPct": round(d.battery_pct, 1),
                    "signalRssiDbm": d.signal_rssi_dbm,
                    "intervalSeconds": d.interval_seconds,
                }
                for d in devices
            ]
        }
    )


@app.get("/sensors/{device_id}")
async def get_sensor(device_id: str) -> JSONResponse:
    """Get details for a single sensor device."""
    dev = sensors.get_device(device_id)
    if dev is None:
        return JSONResponse({"error": f"Device '{device_id}' not found"}, status_code=404)
    return JSONResponse(
        {
            "deviceId": dev.device_id,
            "sensorType": dev.sensor_type.value,
            "label": dev.label,
            "status": dev.status.value,
            "enabled": sensors.is_enabled(dev.device_id),
            "batteryPct": round(dev.battery_pct, 1),
            "signalRssiDbm": dev.signal_rssi_dbm,
            "intervalSeconds": dev.interval_seconds,
            "measurementRange": {
                "min": dev.value_min,
                "max": dev.value_max,
                "unit": dev.value_unit,
            },
        }
    )


@app.get("/readings/latest")
async def get_latest(device_id: Optional[str] = None) -> JSONResponse:
    """Get the latest reading(s). Optionally filter by device_id."""
    latest = sensors.get_latest(device_id)
    if not latest:
        return JSONResponse(
            {"error": "No readings found"}, status_code=404
        )
    return JSONResponse(
        {
            "readings": [
                r.to_dict(config.PAYLOAD_FORMAT) for r in latest.values()
            ]
        }
    )


@app.get("/readings")
async def get_readings(
    device_id: str,
    limit: int = 100,
) -> JSONResponse:
    """Get recent reading history for a specific device."""
    if limit < 1:
        limit = 100
    dev = sensors.get_device(device_id)
    if dev is None:
        return JSONResponse({"error": f"Device '{device_id}' not found"}, status_code=404)
    history = sensors.get_history(device_id, limit=limit)
    return JSONResponse(
        {
            "deviceId": device_id,
            "count": len(history),
            "readings": [r.to_dict(config.PAYLOAD_FORMAT) for r in history],
        }
    )


@app.post("/sensors/{device_id}/read")
async def read_now(device_id: str) -> JSONResponse:
    """Trigger a single immediate reading for a specific device."""
    reading = sensors.read_single(device_id)
    if reading is None:
        return JSONResponse({"error": f"Device '{device_id}' not found"}, status_code=404)
    return JSONResponse(reading.to_dict(config.PAYLOAD_FORMAT))


@app.post("/sensors/{device_id}/start")
async def start_sensor(device_id: str) -> JSONResponse:
    """Enable automatic reading generation for a device."""
    ok = sensors.set_enabled(device_id, True)
    if not ok:
        return JSONResponse({"error": f"Device '{device_id}' not found"}, status_code=404)
    return JSONResponse({"status": "started", "deviceId": device_id})


@app.post("/sensors/{device_id}/stop")
async def stop_sensor(device_id: str) -> JSONResponse:
    """Disable automatic reading generation for a device."""
    ok = sensors.set_enabled(device_id, False)
    if not ok:
        return JSONResponse({"error": f"Device '{device_id}' not found"}, status_code=404)
    return JSONResponse({"status": "stopped", "deviceId": device_id})


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=config.SENSORS_PORT,
        log_level=config.LOG_LEVEL,
        reload=False,
    )
