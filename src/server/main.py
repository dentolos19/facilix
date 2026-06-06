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
import random
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

# Simulation endpoints (local dev via docker-compose).
# When this service runs on the host, localhost works. When it runs inside a
# container, localhost points at the monitoring container itself, so allow an
# override and try common Docker host gateway fallbacks.
SIMULATION_CCTV_API = os.environ.get("SIMULATION_CCTV_API", "http://localhost:3002")
SIMULATION_HLS_BASE = os.environ.get("SIMULATION_HLS_BASE", "http://localhost:3005")
SIMULATION_SENSOR_API = os.environ.get("SIMULATION_SENSOR_API", "http://localhost:3002")
SIMULATION_SENSOR_API_FALLBACKS = os.environ.get(
    "SIMULATION_SENSOR_API_FALLBACKS",
    "http://localhost:3002,http://host.docker.internal:3002,http://facilix-simulator:8000,"
    "http://172.17.0.1:3002,http://172.19.0.1:3002",
)

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
    video_source: str = "simulation",
    simulation_stream: str = "",
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
            f"CCTV '{device_name}' has no stream URL configured — "
            "check that the device has a simulation stream selected or a valid RTSP/RTMP URL set",
            {
                "videoSource": video_source,
                "simulationStream": simulation_stream,
                "hint": "For simulation devices, select a stream (b0/g0) in the facility editor. "
                "For RTSP/RTMP, provide a valid URL in device properties.",
            },
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
    seq = 0  # monotonically increasing sequence counter per camera
    while True:
        try:
            # ── Sample a single frame ──────────────────────────────────
            frame_data = await capture_frame(stream_url)
            if frame_data:
                frame_count += 1
                seq += 1
                await upload_frame(device_id, frame_data, seq)

            # ── Create a video segment ─────────────────────────────────
            if frame_count % (SEGMENT_INTERVAL_SEC // FRAME_INTERVAL_SEC) == 0:
                segment_data, duration = await capture_segment(stream_url)
                if segment_data:
                    seq += 1
                    await upload_segment(device_id, segment_data, duration, seq)

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


async def upload_frame(device_id: str, frame_data: bytes, seq: int = 0) -> None:
    """POST a sampled frame to the Worker frames endpoint."""
    try:
        idem_key = f"{device_id}-frame-{seq}" if seq else f"{device_id}-frame-{int(time.time())}"
        client = get_client()
        resp = await client.post(
            f"{API_BASE}/frames",
            headers={
                **AUTH_HEADER,
                "X-Device-Id": device_id,
                "Content-Type": "image/jpeg",
                "Idempotency-Key": idem_key,
            },
            content=frame_data,
        )
        if resp.status_code != 200:
            print(f"upload_frame failed ({resp.status_code}): {resp.text[:200]}", flush=True)
    except Exception as exc:
        print(f"upload_frame error: {exc}", flush=True)


async def upload_segment(device_id: str, segment_data: bytes, duration: float, seq: int = 0) -> None:
    """POST a video segment to the Worker segments endpoint."""
    try:
        idem_key = f"{device_id}-segment-{seq}" if seq else f"{device_id}-segment-{int(time.time())}"
        client = get_client()
        resp = await client.post(
            f"{API_BASE}/segments",
            headers={
                **AUTH_HEADER,
                "X-Device-Id": device_id,
                "Content-Type": "video/mp4",
                "X-Duration-Sec": str(int(duration)),
                "X-Timestamp": now_iso(),
                "Idempotency-Key": idem_key,
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
    data_source: str,
    pull_url: str,
    simulation_device_id: str,
    poll_interval_ms: int,
    threshold: float,
    unit: str,
    payload_format: str = "facilix",
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
        {"sensorType": sensor_type, "dataSource": data_source, "threshold": threshold, "unit": unit},
    )

    while True:
        try:
            value, status, extra = await read_sensor(
                data_source=data_source,
                simulation_device_id=simulation_device_id,
                pull_url=pull_url,
            )

            if value is not None:
                # Build enriched payload for the Worker
                event_data = {
                    "value": value,
                    "unit": unit,
                    "status": status,
                    "sensorType": sensor_type,
                    "threshold": threshold,
                    "source": data_source,
                    "timestamp": int(time.time() * 1000),
                    **extra,
                }

                if threshold > 0 and value > threshold:
                    await post_event(
                        device_id,
                        "sensor:alert",
                        "warn",
                        f"{sensor_type} value {value:.1f}{unit} exceeds threshold {threshold}{unit}",
                        event_data,
                    )
                else:
                    await post_event(
                        device_id,
                        "sensor:reading",
                        "info",
                        f"{sensor_type} = {value:.1f}{unit}",
                        event_data,
                    )
            else:
                await post_event(
                    device_id,
                    "sensor:error",
                    "error",
                    f"Sensor '{device_name}' unreachable",
                    {"pullUrl": pull_url, "status": status, "source": data_source},
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
    data_source: str,
    simulation_device_id: str,
    pull_url: str,
) -> tuple[float | None, str, dict]:
    """
    Read sensor value from the configured data source.
    Returns (value, status_string, extra_data_dict).
    """
    extra: dict = {}
    data_source = (data_source or "simulation").strip().lower()

    if data_source == "simulation" and simulation_device_id:
        client = get_client()
        bases = [SIMULATION_SENSOR_API, *SIMULATION_SENSOR_API_FALLBACKS.split(",")]
        seen: set[str] = set()
        last_error = "simulation_unreachable"

        for base in bases:
            base = base.strip().rstrip("/")
            if not base or base in seen:
                continue
            seen.add(base)

            url = f"{base}/devices/{simulation_device_id}/latest"
            try:
                resp = await client.get(url, timeout=httpx.Timeout(5.0))
                if resp.status_code == 200:
                    data = resp.json()
                    value = float(data.get("value", 0))
                    status = data.get("status", "ok")
                    extra["batteryPct"] = data.get("batteryPct")
                    extra["signalRssiDbm"] = data.get("signalRssiDbm")
                    extra["sourceUrl"] = url
                    return value, status, extra
                last_error = f"{base}:http_{resp.status_code}"
            except Exception as exc:
                last_error = f"{base}:{exc}"

        return None, last_error, extra

    if data_source == "http-pull" and pull_url:
        try:
            client = get_client()
            resp = await client.get(pull_url, timeout=httpx.Timeout(10.0))
            if resp.status_code == 200:
                data = resp.json()
                value = float(data.get("value", data.get("reading", 0)))
                extra["batteryPct"] = data.get("batteryPct")
                extra["signalRssiDbm"] = data.get("signalRssiDbm")
                return value, "ok", extra
            return None, f"http_{resp.status_code}", extra
        except Exception as exc:
            return None, str(exc), extra

    # HTTP Push / Ingest — no polling, value comes from external push
    if data_source == "http-push":
        return None, "push_only", extra

    return None, "no_source", extra


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
        print(
            f"fetch_config attempt {attempt}/{max_retries} failed — retrying in {delay:.1f}s",
            flush=True,
        )
        await asyncio.sleep(delay)
    else:
        print(
            f"ERROR: Could not fetch config after {max_retries} attempts — container will idle",
            flush=True,
        )
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
