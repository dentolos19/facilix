"""Sensor simulation API routes."""

from __future__ import annotations

import logging
from typing import Optional

import fastapi
from fastapi.responses import JSONResponse

import config as sim_config
import sensor_engine

logger = logging.getLogger("simulator.sensor-api")

router = fastapi.APIRouter(tags=["sensors"])


# ---------------------------------------------------------------------------
# Health (sensor-specific)
# ---------------------------------------------------------------------------


@router.get("/sensors/health")
async def sensors_health() -> JSONResponse:
    """Sensor-only health check."""
    total = len(sensor_engine.get_devices())
    online = sum(1 for d in sensor_engine.get_devices() if d.status.value in ("ok", "degraded"))
    return JSONResponse(
        {
            "status": "ok" if online == total else "degraded",
            "sensors": {"total": total, "online": online},
        }
    )


# ---------------------------------------------------------------------------
# Device listing
# ---------------------------------------------------------------------------


@router.get("/sensors")
async def list_sensors() -> JSONResponse:
    """List all configured sensor devices."""
    devices = sensor_engine.get_devices()
    return JSONResponse(
        {
            "sensors": [
                {
                    "deviceId": d.device_id,
                    "sensorType": d.sensor_type.value,
                    "label": d.label,
                    "status": d.status.value,
                    "enabled": sensor_engine.is_enabled(d.device_id),
                    "batteryPct": round(d.battery_pct, 1),
                    "signalRssiDbm": d.signal_rssi_dbm,
                    "intervalSeconds": d.interval_seconds,
                }
                for d in devices
            ]
        }
    )


@router.get("/sensors/{device_id}")
async def get_sensor(device_id: str) -> JSONResponse:
    """Get details for a single sensor device."""
    dev = sensor_engine.get_device(device_id)
    if dev is None:
        return JSONResponse({"error": f"Device '{device_id}' not found"}, status_code=404)
    return JSONResponse(
        {
            "deviceId": dev.device_id,
            "sensorType": dev.sensor_type.value,
            "label": dev.label,
            "status": dev.status.value,
            "enabled": sensor_engine.is_enabled(dev.device_id),
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


# ---------------------------------------------------------------------------
# Readings
# ---------------------------------------------------------------------------


@router.get("/readings/latest")
async def get_latest(device_id: Optional[str] = None) -> JSONResponse:
    """Get the latest reading(s). Optionally filter by device_id."""
    latest = sensor_engine.get_latest(device_id)
    if not latest:
        return JSONResponse({"error": "No readings found"}, status_code=404)
    return JSONResponse({"readings": [r.to_dict(sim_config.SENSOR_PAYLOAD_FORMAT) for r in latest.values()]})


@router.get("/readings")
async def get_readings(device_id: str, limit: int = 100) -> JSONResponse:
    """Get recent reading history for a specific device."""
    if limit < 1:
        limit = 100
    dev = sensor_engine.get_device(device_id)
    if dev is None:
        return JSONResponse({"error": f"Device '{device_id}' not found"}, status_code=404)
    history = sensor_engine.get_history(device_id, limit=limit)
    return JSONResponse(
        {
            "deviceId": device_id,
            "count": len(history),
            "readings": [r.to_dict(sim_config.SENSOR_PAYLOAD_FORMAT) for r in history],
        }
    )


# ---------------------------------------------------------------------------
# Per-device actions
# ---------------------------------------------------------------------------


@router.post("/sensors/{device_id}/read")
async def read_now(device_id: str) -> JSONResponse:
    """Trigger a single immediate reading for a specific device."""
    reading = sensor_engine.read_single(device_id)
    if reading is None:
        return JSONResponse({"error": f"Device '{device_id}' not found"}, status_code=404)
    return JSONResponse(reading.to_dict(sim_config.SENSOR_PAYLOAD_FORMAT))


@router.post("/sensors/{device_id}/start")
async def start_sensor(device_id: str) -> JSONResponse:
    """Enable automatic reading generation for a device."""
    ok = sensor_engine.set_enabled(device_id, True)
    if not ok:
        return JSONResponse({"error": f"Device '{device_id}' not found"}, status_code=404)
    return JSONResponse({"status": "started", "deviceId": device_id})


@router.post("/sensors/{device_id}/stop")
async def stop_sensor(device_id: str) -> JSONResponse:
    """Disable automatic reading generation for a device."""
    ok = sensor_engine.set_enabled(device_id, False)
    if not ok:
        return JSONResponse({"error": f"Device '{device_id}' not found"}, status_code=404)
    return JSONResponse({"status": "stopped", "deviceId": device_id})


# ---------------------------------------------------------------------------
# Backward compatibility endpoint for the monitoring server
# (src/server/main.py calls /devices/{simulation_device_id}/latest)
# ---------------------------------------------------------------------------


@router.get("/devices/{device_id}/latest")
async def get_device_latest(device_id: str) -> JSONResponse:
    """Get the latest reading for a device in a simple {value, status} shape."""
    latest = sensor_engine.get_latest(device_id)
    reading = latest.get(device_id)
    if reading is None:
        return JSONResponse(
            {"error": f"No reading for device '{device_id}'"},
            status_code=404,
        )
    return JSONResponse(
        {
            "value": reading.value,
            "unit": reading.unit,
            "status": reading.status.value,
            "batteryPct": round(reading.battery_pct, 1),
            "timestamp": reading.timestamp.isoformat(),
        }
    )
