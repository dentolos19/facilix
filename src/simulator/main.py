"""Unified Simulator — combines CCTV video streaming and IoT sensor
telemetry generation into a single FastAPI application.

Endpoints
---------
- GET  /health                         Combined health status
- GET  /devices                        Unified device inventory (CCTV + sensors)
- GET  /cctv                           List CCTV streams
- GET  /cctv/health                    CCTV-only health
- GET  /cctv/{name}                    Single stream detail
- POST /cctv/{name}/start
- POST /cctv/{name}/stop
- POST /cctv/{name}/restart
- GET  /cctv/{name}/hls/{path}         HLS playback proxy
- GET  /sensors                        List sensor devices
- GET  /sensors/{identifier}           Single sensor (type or device ID)
- GET  /sensors/{identifier}/latest    Latest reading
- GET  /sensors/{identifier}/readings  Reading history
- POST /sensors/{identifier}/read     Force one reading
- POST /sensors/{identifier}/start    Enable auto-generation
- POST /sensors/{identifier}/stop     Disable auto-generation
- GET  /devices/{device_id}/latest     Monitoring-compat endpoint
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

import fastapi
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
import cctv as cctv_module
from logs import configure_logging
from sensor import router as sensor_router
import sensor as sensor_engine

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

configure_logging(config.LOG_LEVEL)
logger = logging.getLogger("simulator")

# ---------------------------------------------------------------------------
# Background tasks
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

    sensor_engine.init()
    _sensor_task = asyncio.create_task(_sensor_read_loop())
    logger.info(
        "Sensor simulator started (interval=%ds, format=%s)",
        config.SENSOR_DEFAULT_INTERVAL_SECONDS,
        config.SENSOR_PAYLOAD_FORMAT,
    )

    await cctv_module.initialize_streams()
    _cctv_health_task = asyncio.create_task(cctv_module.health_loop())

    yield

    if _sensor_task is not None:
        _sensor_task.cancel()
        try:
            await _sensor_task
        except asyncio.CancelledError:
            pass

    if _cctv_health_task is not None:
        _cctv_health_task.cancel()
        try:
            await _cctv_health_task
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
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cctv_module.router)
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
# Unified device listing
# ---------------------------------------------------------------------------


@app.get("/devices")
async def list_devices() -> JSONResponse:
    """Return a unified inventory of all CCTV streams and sensor devices."""
    cctv_devices = [
        {
            "type": "cctv",
            "id": sp.name,
            "label": sp.video_info.label if sp.video_info else sp.name,
            "status": "online" if sp.is_alive else "offline",
            "stream": sp.info(),
        }
        for sp in cctv_module.streams.values()
    ]

    sensor_devices = [
        {
            "type": "sensor",
            "id": d.device_id,
            "sensorType": d.sensor_type.value,
            "label": d.label,
            "status": d.status.value,
            "enabled": sensor_engine.is_enabled(d.device_id),
        }
        for d in sensor_engine.get_devices()
    ]

    return JSONResponse({"devices": cctv_devices + sensor_devices})


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        log_level=config.LOG_LEVEL,
        reload=False,
    )
