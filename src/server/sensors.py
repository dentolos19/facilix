"""Sensor monitoring and polling helpers."""

from __future__ import annotations

import asyncio
import time

import httpx

from config import SIMULATOR_URL, SIMULATION_SENSOR_API_FALLBACKS
from utils import get_http_client
from api import post_event


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
        client = get_http_client()
        bases = [SIMULATOR_URL, *SIMULATION_SENSOR_API_FALLBACKS.split(",")]
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
            client = get_http_client()
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
