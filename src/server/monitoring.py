"""Monitoring task orchestration."""

from __future__ import annotations

import asyncio
import logging
import random
import time
from typing import Any

from cctv import monitor_cctv
from sensors import monitor_sensor
from config import FACILITY_ID, HEARTBEAT_INTERVAL_SEC
from api import fetch_config, post_event

log = logging.getLogger("facilix")


async def heartbeat_loop(facility_id: str) -> None:
    """Post periodic heartbeat events to show the container is alive."""
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL_SEC)
        await post_event(
            facility_id,
            "monitoring:heartbeat",
            "info",
            "Container heartbeat",
            {"uptimeSec": int(time.time())},
        )


async def startup_monitoring() -> None:
    """Fetch config and start all monitoring tasks.

    Retries `fetch_config()` with exponential backoff so a brief network
    blip or cold-start delay doesn't leave the container permanently idle.
    """
    max_retries = 5
    base_delay = 2.0
    config = None
    for attempt in range(1, max_retries + 1):
        config = await fetch_config()
        if config:
            break
        delay = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 1)
        log.warning("fetch_config attempt %d/%d failed — retrying in %.1fs", attempt, max_retries, delay)
        await asyncio.sleep(delay)
    else:
        log.error("could not fetch config after %d attempts — container will idle", max_retries)
        return

    tasks: list[asyncio.Task[Any]] = []

    # Start CCTV monitoring tasks
    for cam in config.get("cctv", []):
        task = asyncio.create_task(
            monitor_cctv(
                device_id=cam["id"],
                device_name=cam.get("name", ""),
                stream_url=cam.get("streamUrl", ""),
                video_source=cam.get("videoSource", "simulation"),
                simulation_stream=cam.get("simulationStream", ""),
                frame_enabled=cam.get("frameCaptureEnabled", True),
                frame_interval_sec=cam.get("frameIntervalSec", 5),
                segment_enabled=cam.get("segmentCaptureEnabled", True),
                segment_interval_sec=cam.get("segmentIntervalSec", 30),
                segment_duration_sec=cam.get("segmentDurationSec", 30),
            ),
            name=f"cctv-{cam['id']}",
        )
        tasks.append(task)

    # Start sensor monitoring tasks
    for sensor in config.get("sensors", []):
        task = asyncio.create_task(
            monitor_sensor(
                device_id=sensor["id"],
                device_name=sensor.get("name", ""),
                sensor_type=sensor.get("sensorType", ""),
                data_source=sensor.get("dataSource", "simulation"),
                pull_url=sensor.get("pullUrl", ""),
                simulation_device_id=sensor.get("simulationDeviceId", ""),
                poll_interval_ms=sensor.get("pollIntervalMs", 30000),
                threshold=sensor.get("threshold", 0),
                unit=sensor.get("unit", ""),
                payload_format=sensor.get("payloadFormat", "facilix"),
            ),
            name=f"sensor-{sensor['id']}",
        )
        tasks.append(task)

    # Start heartbeat
    tasks.append(
        asyncio.create_task(heartbeat_loop(FACILITY_ID), name="heartbeat"),
    )

    # Log startup event
    await post_event(
        FACILITY_ID,
        "monitoring:started",
        "info",
        f"Monitoring container started for facility {FACILITY_ID}",
        {"cctvCount": len(config.get("cctv", [])), "sensorCount": len(config.get("sensors", []))},
    )

    # Wait for all tasks (they shouldn't complete unless cancelled)
    try:
        await asyncio.gather(*tasks, return_exceptions=True)
    except asyncio.CancelledError:
        pass
