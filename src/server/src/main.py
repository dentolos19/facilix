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
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request

from api import post_event
from config import (
    CONFIG_READY,
    FACILITY_ID,
    LOG_LEVEL,
    MONITORING_API_URL,
    MONITORING_TOKEN,
    SIMULATOR_URL,
)
from monitoring import startup_monitoring
from network import log_stream_rewrite_config
from roboflow import process_video_workflow
from utils import close_http_client, configure_logging, now_iso

configure_logging()

log = logging.getLogger("facilix")


def log_config_warnings() -> None:
    """Log startup warnings for missing or container-unreachable settings."""
    if not CONFIG_READY:
        missing = []
        if not FACILITY_ID:
            missing.append("FACILITY_ID")
        if not MONITORING_API_URL:
            missing.append("MONITORING_API_URL")
        if not MONITORING_TOKEN:
            missing.append("MONITORING_TOKEN")
        log.warning("missing env vars: %s — monitoring will idle", ", ".join(missing))


async def on_startup() -> None:
    label = FACILITY_ID or "unknown"
    log_stream_rewrite_config()
    log_config_warnings()
    log.info("monitoring starting for facility %s", label)
    log.info(
        "config: MONITORING_API_URL=%s, SIMULATOR_URL=%s, LOG_LEVEL=%s",
        MONITORING_API_URL,
        SIMULATOR_URL,
        LOG_LEVEL,
    )
    if CONFIG_READY:
        asyncio.create_task(startup_monitoring(), name="startup-monitoring")
    else:
        log.warning("container running in idle mode — monitoring disabled")


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
            "monitoring:stopping",
            "info",
            "Monitoring service is shutting down",
        )
    await close_http_client()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    await on_startup()
    try:
        yield
    finally:
        await on_shutdown()


app = FastAPI(lifespan=lifespan, title="facilix-server")


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
    request: Request,
    workspace_name: str,
    workflow_id: str,
    input_name: str = "image",
    data_output_names: Annotated[list[str] | None, Query()] = None,
    class_filter: Annotated[list[str] | None, Query()] = None,
    frame_interval: Annotated[int, Query(ge=1)] = 30,
    min_confidence: Annotated[float, Query(ge=0, le=1)] = 0.4,
) -> dict[str, Any]:
    """Process a video segment through a vision model.

    Accepts video bytes as the request body (raw bytes with content-type video/mp4).
    Called by the Worker processor to run object detection on CCTV segments.
    Returns detections plus video metadata for playback alignment.
    """
    video_bytes = await request.body()

    if not video_bytes:
        raise HTTPException(status_code=400, detail="No video data provided")

    try:
        result = await process_video_workflow(
            video_bytes=video_bytes,
            workspace_name=workspace_name,
            workflow_id=workflow_id,
            input_name=input_name,
            data_output_names=data_output_names,
            class_filter=class_filter,
            frame_interval=frame_interval,
            min_confidence=min_confidence,
            roboflow_api_key=request.headers.get("x-roboflow-api-key"),
            roboflow_api_base=request.headers.get("x-roboflow-api-base"),
        )
        return result
    except Exception as exc:
        log.exception("process-video error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
