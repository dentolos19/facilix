"""Unified Simulator — combines CCTV video streaming and IoT sensor
telemetry generation into a single FastAPI application.

Endpoints
---------
- GET  /health                   Combined health status
- GET  /cctv/health              CCTV-only health
- GET  /streams                  List CCTV streams
- POST /streams/{name}/start
- POST /streams/{name}/stop
- POST /streams/{name}/restart
- GET  /sensors/health           Sensor-only health
- GET  /sensors                  List sensor devices
- GET  /sensors/{device_id}      Single sensor detail
- GET  /readings/latest          Latest sensor readings
- GET  /readings                 Reading history
- POST /sensors/{device_id}/read  Force one reading
- POST /sensors/{device_id}/start Enable auto-generation
- POST /sensors/{device_id}/stop  Disable auto-generation
- GET  /devices/{device_id}/latest  Simple reading for monitoring server
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

import fastapi
import uvicorn
from fastapi.responses import JSONResponse

import config
import cctv as cctv_module
import sensor_engine
from sensor_routes import router as sensor_router

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("simulator")

# ---------------------------------------------------------------------------
# Background sensor reading
# ---------------------------------------------------------------------------

_sensor_task: Optional[asyncio.Task] = None
_cctv_health_task: Optional[asyncio.Task] = None


async def _sensor_read_loop() -> None:
    """Periodically generate readings for all enabled sensors."""
    interval = config.SENSOR_DEFAULT_INTERVAL_SECONDS
    while True:
        start = asyncio.get_event_loop().time()
        gen = sensor_engine.generate_readings()
        if gen:
            logger.debug("Generated %d sensor reading(s)", len(gen))
        elapsed = asyncio.get_event_loop().time() - start
        wait = max(0.0, interval - elapsed)
        await asyncio.sleep(wait)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    """Start CCTV streams and sensor background loop on startup,
    clean up on shutdown."""
    global _sensor_task, _cctv_health_task

    # --- Initialize sensors ---
    sensor_engine.init()
    _sensor_task = asyncio.create_task(_sensor_read_loop())
    logger.info(
        "Sensor simulator started (interval=%ds, format=%s)",
        config.SENSOR_DEFAULT_INTERVAL_SECONDS,
        config.SENSOR_PAYLOAD_FORMAT,
    )

    # --- Initialize CCTV streams ---
    await cctv_module.initialize_streams()
    _cctv_health_task = asyncio.create_task(cctv_module.health_loop())

    yield

    # --- Shutdown ---
    if _sensor_task is not None:
        _sensor_task.cancel()
        try:
            await _sensor_task
        except asyncio.CancelledError:
            pass

    await cctv_module.shutdown_streams()
    logger.info("Simulator stopped")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = fastapi.FastAPI(
    title="Facilix Simulator",
    description=(
        "Unified simulator for CCTV video streams (looping MP4 files "
        "published as RTSP/RTMP via MediaMTX) and IoT sensor telemetry "
        "(temperature, humidity, pressure, light, motion, air quality, etc.)."
    ),
    version="0.2.0",
    lifespan=lifespan,
)

# -- Mount routes -----------------------------------------------------------

app.include_router(cctv_module.router)
app.include_router(cctv_module.health_router)
app.include_router(sensor_router)


# ---------------------------------------------------------------------------
# Combined health
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> JSONResponse:
    """Combined health check for CCTV streams and sensor devices."""
    cctv_alive = sum(1 for sp in cctv_module.streams.values() if sp.is_alive)
    cctv_total = len(cctv_module.streams)

    sensor_total = len(sensor_engine.get_devices())
    sensor_online = sum(1 for d in sensor_engine.get_devices() if d.status.value in ("ok", "degraded"))

    overall = "ok" if cctv_alive == cctv_total and sensor_online == sensor_total else "degraded"

    return JSONResponse(
        {
            "status": overall,
            "cctv": {"alive": cctv_alive, "total": cctv_total},
            "sensors": {"total": sensor_total, "online": sensor_online},
        }
    )


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(
        "simulator.main:app",
        host="0.0.0.0",
        port=8000,
        log_level=config.LOG_LEVEL,
        reload=False,
    )
