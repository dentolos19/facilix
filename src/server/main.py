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
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI

# ---------------------------------------------------------------------------
# Constants / Config
# ---------------------------------------------------------------------------

app = FastAPI(title="facilix-server")

FACILITY_ID = os.environ.get("FACILITY_ID", "")
APP_ORIGIN = os.environ.get("APP_ORIGIN", "http://localhost:3000")
INGEST_TOKEN = os.environ.get("INGEST_TOKEN", "")

API_BASE = f"{APP_ORIGIN}/api/facility/{FACILITY_ID}/monitoring"
AUTH_HEADER = {"Authorization": f"Bearer {INGEST_TOKEN}"}

CONFIG_READY = bool(FACILITY_ID and INGEST_TOKEN)
if not CONFIG_READY:
    missing = []
    if not FACILITY_ID:
        missing.append("FACILITY_ID")
    if not INGEST_TOKEN:
        missing.append("INGEST_TOKEN")
    print(f"WARNING: missing env vars: {', '.join(missing)} — monitoring will idle", flush=True)

if APP_ORIGIN.startswith("http://localhost") or APP_ORIGIN.startswith("http://127.0.0.1"):
    print(
        "WARNING: APP_ORIGIN points at localhost. Inside a container, localhost is the container itself, "
        "not your host machine. Use the deployed Worker URL, a Cloudflare Tunnel URL, or host.docker.internal "
        "for local Docker testing.",
        flush=True,
    )

# Tuning
FRAME_INTERVAL_SEC = 30  # sample one frame every 30 s per CCTV
SEGMENT_INTERVAL_SEC = 60  # create one video segment every 60 s per CCTV
SEGMENT_DURATION_SEC = 30  # actual segment length in ffmpeg
HEARTBEAT_INTERVAL_SEC = 120  # post monitoring:heartbeat every 2 min
HTTP_TIMEOUT_SEC = 30

# Simulation endpoints (local dev via docker-compose)
SIMULATION_CCTV_API = "http://localhost:3002"
SIMULATION_HLS_BASE = "http://localhost:3005"
SIMULATION_SENSOR_API = "http://localhost:3002"

# ---------------------------------------------------------------------------
# Shared HTTP client
# ---------------------------------------------------------------------------

_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(HTTP_TIMEOUT_SEC))
    return _client


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def post_event(
    device_id: str,
    event_type: str,
    severity: str,
    message: str,
    extra: dict[str, Any] | None = None,
) -> bool:
    """POST an event to the Worker events endpoint."""
    payload = {
        "deviceId": device_id,
        "type": event_type,
        "severity": severity,
        "message": message,
        "data": extra or {},
    }
    try:
        client = get_client()
        resp = await client.post(
            f"{API_BASE}/events",
            headers=AUTH_HEADER,
            json=payload,
        )
        if resp.status_code != 200:
            print(f"post_event failed ({resp.status_code}): {resp.text[:200]}", flush=True)
            return False
        return True
    except Exception as exc:
        print(f"post_event error: {exc}", flush=True)
        return False


async def fetch_config() -> dict[str, Any] | None:
    """Fetch facility monitoring configuration from the Worker."""
    try:
        client = get_client()
        resp = await client.get(f"{API_BASE}/config", headers=AUTH_HEADER)
        if resp.status_code == 200:
            return resp.json()
        print(f"fetch_config failed ({resp.status_code}): {resp.text[:200]}", flush=True)
        return None
    except Exception as exc:
        print(f"fetch_config error: {exc}", flush=True)
        return None


# ---------------------------------------------------------------------------
# CCTV monitoring
# ---------------------------------------------------------------------------


async def monitor_cctv(
    device_id: str,
    device_name: str,
    stream_url: str,
) -> None:
    """
    Background task for a single CCTV device.

    - Samples a low-res frame every FRAME_INTERVAL_SEC and POSTs it.
    - Creates a short video segment every SEGMENT_INTERVAL_SEC and POSTs it.
    """
    if not stream_url:
        await post_event(
            device_id,
            "cctv:error",
            "warn",
            f"CCTV '{device_name}' has no stream URL configured",
        )
        return

    await post_event(
        device_id,
        "cctv:monitoring:started",
        "info",
        f"Started monitoring CCTV '{device_name}'",
        {"streamUrl": stream_url},
    )

    frame_count = 0
    while True:
        try:
            # ── Sample a single frame ──────────────────────────────────
            frame_data = await capture_frame(stream_url)
            if frame_data:
                frame_count += 1
                await upload_frame(device_id, frame_data)

            # ── Create a video segment ─────────────────────────────────
            if frame_count % (SEGMENT_INTERVAL_SEC // FRAME_INTERVAL_SEC) == 0:
                segment_data, duration = await capture_segment(stream_url)
                if segment_data:
                    await upload_segment(device_id, segment_data, duration)

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await post_event(
                device_id,
                "cctv:error",
                "warn",
                f"CCTV monitoring error: {exc}",
            )

        await asyncio.sleep(FRAME_INTERVAL_SEC)


async def capture_frame(stream_url: str) -> bytes | None:
    """Use ffmpeg to capture a single JPEG frame from the stream."""
    proc: asyncio.subprocess.Process | None = None
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-i",
            stream_url,
            "-frames:v",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "-q:v",
            "5",  # low quality = small payload
            "-",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _stderr = await asyncio.wait_for(proc.communicate(), timeout=FRAME_INTERVAL_SEC)
        if proc.returncode == 0 and len(stdout) > 100:
            return stdout
        return None
    except TimeoutError:
        if proc and proc.returncode is None:
            proc.kill()
            await proc.communicate()
        return None
    except FileNotFoundError:
        print("ERROR: ffmpeg not found", flush=True)
        return None


async def capture_segment(stream_url: str) -> tuple[bytes | None, float]:
    """Use ffmpeg to capture a short video segment."""
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp_path = tmp.name
    proc: asyncio.subprocess.Process | None = None
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-i",
            stream_url,
            "-t",
            str(SEGMENT_DURATION_SEC),
            "-c",
            "copy",
            "-f",
            "mp4",
            "-movflags",
            "frag_keyframe+empty_moov",
            "-y",
            tmp_path,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        await asyncio.wait_for(proc.communicate(), timeout=SEGMENT_DURATION_SEC + 10)
        if proc.returncode == 0:
            data = await asyncio.to_thread(Path(tmp_path).read_bytes)
            return data, float(SEGMENT_DURATION_SEC)
        return None, 0.0
    except TimeoutError:
        if proc and proc.returncode is None:
            proc.kill()
            await proc.communicate()
        return None, 0.0
    except FileNotFoundError:
        print("ERROR: ffmpeg not found", flush=True)
        return None, 0.0
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except OSError:
            pass


async def upload_frame(device_id: str, frame_data: bytes) -> None:
    """POST a sampled frame to the Worker frames endpoint."""
    try:
        client = get_client()
        resp = await client.post(
            f"{API_BASE}/frames",
            headers={
                **AUTH_HEADER,
                "X-Device-Id": device_id,
                "Content-Type": "image/jpeg",
            },
            content=frame_data,
        )
        if resp.status_code != 200:
            print(f"upload_frame failed ({resp.status_code}): {resp.text[:200]}", flush=True)
    except Exception as exc:
        print(f"upload_frame error: {exc}", flush=True)


async def upload_segment(device_id: str, segment_data: bytes, duration: float) -> None:
    """POST a video segment to the Worker segments endpoint."""
    try:
        client = get_client()
        resp = await client.post(
            f"{API_BASE}/segments",
            headers={
                **AUTH_HEADER,
                "X-Device-Id": device_id,
                "Content-Type": "video/mp4",
                "X-Duration-Sec": str(int(duration)),
                "X-Timestamp": now_iso(),
            },
            content=segment_data,
        )
        if resp.status_code != 200:
            print(f"upload_segment failed ({resp.status_code}): {resp.text[:200]}", flush=True)
    except Exception as exc:
        print(f"upload_segment error: {exc}", flush=True)


# ---------------------------------------------------------------------------
# Sensor monitoring
# ---------------------------------------------------------------------------


async def monitor_sensor(
    device_id: str,
    device_name: str,
    sensor_type: str,
    pull_url: str,
    simulation_device_id: str,
    poll_interval_ms: int,
    threshold: float,
    unit: str,
) -> None:
    """
    Background task for a single sensor device.

    Polls the configured data source and posts events when values
    exceed the configured threshold.
    """
    await post_event(
        device_id,
        "sensor:monitoring:started",
        "info",
        f"Started monitoring sensor '{device_name}'",
        {"sensorType": sensor_type, "threshold": threshold, "unit": unit},
    )

    while True:
        try:
            value, status = await read_sensor(
                simulation_device_id,
                pull_url,
            )

            if value is not None:
                # Check threshold
                if threshold > 0 and value > threshold:
                    await post_event(
                        device_id,
                        "sensor:alert",
                        "warn",
                        f"{sensor_type} value {value:.1f}{unit} exceeds threshold {threshold}{unit}",
                        {"value": value, "threshold": threshold, "unit": unit, "status": status},
                    )
                else:
                    await post_event(
                        device_id,
                        "sensor:reading",
                        "info",
                        f"{sensor_type} = {value:.1f}{unit}",
                        {"value": value, "threshold": threshold, "unit": unit, "status": status},
                    )
            else:
                await post_event(
                    device_id,
                    "sensor:error",
                    "error",
                    f"Sensor '{device_name}' unreachable",
                    {"pullUrl": pull_url, "status": status},
                )

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await post_event(
                device_id,
                "sensor:error",
                "error",
                f"Sensor monitoring error: {exc}",
            )

        await asyncio.sleep(poll_interval_ms / 1000)


async def read_sensor(
    simulation_device_id: str,
    pull_url: str,
) -> tuple[float | None, str]:
    """
    Read sensor value from simulation API or external pull URL.
    Returns (value, status_string).
    """
    # Simulation source (local dev)
    if simulation_device_id:
        try:
            client = get_client()
            url = f"{SIMULATION_SENSOR_API}/devices/{simulation_device_id}/latest"
            resp = await client.get(url, timeout=httpx.Timeout(5.0))
            if resp.status_code == 200:
                data = resp.json()
                value = float(data.get("value", 0))
                status = data.get("status", "ok")
                return value, status
            return None, f"http_{resp.status_code}"
        except Exception as exc:
            return None, str(exc)

    # HTTP Pull source (external API)
    if pull_url:
        try:
            client = get_client()
            resp = await client.get(pull_url, timeout=httpx.Timeout(10.0))
            if resp.status_code == 200:
                data = resp.json()
                value = float(data.get("value", data.get("reading", 0)))
                return value, "ok"
            return None, f"http_{resp.status_code}"
        except Exception as exc:
            return None, str(exc)

    return None, "no_source"


# ---------------------------------------------------------------------------
# Heartbeat
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------


async def startup_monitoring() -> None:
    """Fetch config and start all monitoring tasks."""
    config = await fetch_config()
    if not config:
        print("ERROR: Could not fetch config — container will idle", flush=True)
        return

    tasks: list[asyncio.Task[Any]] = []

    # Start CCTV monitoring tasks
    for cam in config.get("cctv", []):
        task = asyncio.create_task(
            monitor_cctv(
                device_id=cam["id"],
                device_name=cam.get("name", ""),
                stream_url=cam.get("streamUrl", ""),
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
                pull_url=sensor.get("pullUrl", ""),
                simulation_device_id=sensor.get("simulationDeviceId", ""),
                poll_interval_ms=sensor.get("pollIntervalMs", 30000),
                threshold=sensor.get("threshold", 0),
                unit=sensor.get("unit", ""),
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


# ---------------------------------------------------------------------------
# FastAPI lifespan
# ---------------------------------------------------------------------------


@app.on_event("startup")
async def on_startup() -> None:
    label = FACILITY_ID or "unknown"
    print(f"Monitoring starting for facility {label}", flush=True)
    if CONFIG_READY:
        asyncio.create_task(startup_monitoring(), name="startup-monitoring")
    else:
        print("Container running in idle mode — monitoring disabled", flush=True)


@app.on_event("shutdown")
async def on_shutdown() -> None:
    label = FACILITY_ID or "unknown"
    print(f"Monitoring shutting down for facility {label}", flush=True)
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
    # Close HTTP client
    global _client
    if _client:
        await _client.aclose()
        _client = None


# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------


@app.get("/")
async def root() -> dict[str, Any]:
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


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3001)
