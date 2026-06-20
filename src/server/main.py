"""
Facilix Monitoring Container Service.

Runs inside a Cloudflare Container (one per facility).
- Fetches facility device config from the Worker API.
- Monitors CCTV streams: samples frames, creates periodic segments,
  and POSTs them back to the Worker for AI analysis and R2 storage.
- Monitors sensors: polls simulation/pull APIs, checks thresholds,
  and POSTs events to the Worker.
- POSTs periodic heartbeats and structured app logs.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import uvicorn
from fastapi import FastAPI, Request

from api import post_event
from config import (
    APP_ORIGIN,
    CONFIG_READY,
    FACILITY_ID,
    INGEST_TOKEN,
    LOG_LEVEL,
    SIMULATION_HLS_BASE,
    SIMULATION_SENSOR_API,
)
from monitoring import startup_monitoring
from network import log_stream_rewrite_config
from roboflow import process_video_workflow
from utils import close_http_client, configure_logging, now_iso

configure_logging()

app = FastAPI(title="facilix-server")
log = logging.getLogger("facilix")


def log_config_warnings() -> None:
    """Log startup warnings for missing or container-unreachable settings."""
    if not CONFIG_READY:
        missing = []
        if not FACILITY_ID:
            missing.append("FACILITY_ID")
        if not INGEST_TOKEN:
            missing.append("INGEST_TOKEN")
        log.warning("missing env vars: %s — monitoring will idle", ", ".join(missing))

    if APP_ORIGIN.startswith("http://localhost") or APP_ORIGIN.startswith("http://127.0.0.1"):
        log.warning(
            "APP_ORIGIN points at localhost. Inside a container this is unreachable. "
            "Use the deployed Worker URL, a Cloudflare Tunnel URL, or host.docker.internal."
        )


@app.on_event("startup")
async def on_startup() -> None:
    label = FACILITY_ID or "unknown"
    log_stream_rewrite_config()
    log_config_warnings()
    log.info("monitoring starting for facility %s", label)
    log.info(
        "config: APP_ORIGIN=%s, SIMULATION_HLS_BASE=%s, SIMULATION_SENSOR_API=%s, LOG_LEVEL=%s",
        APP_ORIGIN,
        SIMULATION_HLS_BASE,
        SIMULATION_SENSOR_API,
        LOG_LEVEL,
    )
    if CONFIG_READY:
        asyncio.create_task(startup_monitoring(), name="startup-monitoring")
    else:
        log.warning("container running in idle mode — monitoring disabled")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    label = FACILITY_ID or "unknown"
    log.info("monitoring shutting down for facility %s", label)
    # Cancel all running tasks
    for task in asyncio.all_tasks():
        if task is not asyncio.current_task() and not task.done():
            task.cancel()
    # Post shutdown event (best-effort)
    if CONFIG_READY:
        await post_event(
            FACILITY_ID,
            "monitoring:stopped",
            "info",
            "Monitoring container stopped",
        )
    await close_http_client()


@app.get("/")
async def root() -> dict[str, object]:
    return {
        "service": "facilix-server",
        "facilityId": FACILITY_ID,
        "status": "running",
        "timestamp": now_iso(),
    }


@app.get("/ping")
async def ping() -> dict[str, str]:
    """Liveness check used by the Cloudflare Containers platform."""
    return {"status": "ok"}


@app.post("/process-video")
async def process_video(
    request: "Request",
    workspace_name: str,
    workflow_id: str,
    input_name: str = "image",
    frame_interval: int = 30,
    min_confidence: float = 0.4,
) -> dict[str, Any]:
    """Process a video segment through a Roboflow workflow.

    Accepts video bytes as the request body (raw bytes with content-type video/mp4).
    Called by the Worker processor to run object detection on CCTV segments.
    """
    video_bytes = await request.body()

    if not video_bytes:
        return {"error": "No video data provided", "detections": []}

    try:
        detections = await process_video_workflow(
            video_bytes=video_bytes,
            workspace_name=workspace_name,
            workflow_id=workflow_id,
            input_name=input_name,
            frame_interval=frame_interval,
            min_confidence=min_confidence,
        )
        return {"detections": detections, "count": len(detections)}
    except Exception as exc:
        log.exception("process-video error: %s", exc)
        return {"error": str(exc), "detections": []}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3001)
