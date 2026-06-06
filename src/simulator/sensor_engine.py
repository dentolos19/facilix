"""Sensor simulation engine — generates realistic telemetry readings with
smooth drift, occasional spurious events, and battery/signal degradation."""

from __future__ import annotations

import logging
import random
from datetime import datetime, timezone
from typing import Dict, List, Optional

import config
from sensor_models import (
    SENSOR_DEFINITIONS,
    SensorDevice,
    SensorReading,
    SensorStatus,
    SensorType,
)

logger = logging.getLogger("simulator.sensors")

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

_devices: Dict[str, SensorDevice] = {}
_readings: Dict[str, List[SensorReading]] = {}
_latest: Dict[str, SensorReading] = {}
_device_enabled: Dict[str, bool] = {}
_sequence: Dict[str, int] = {}
_rng: random.Random


def init() -> None:
    """Initialize sensor simulator state from definitions."""
    seed = config.RANDOM_SEED
    global _rng
    _rng = random.Random(seed)

    for dev in SENSOR_DEFINITIONS:
        dev.battery_pct = _rng.uniform(80.0, 100.0)
        dev.signal_rssi_dbm = _rng.randint(-70, -50)
        dev._current_value = _rng.uniform(dev.value_min, dev.value_max)
        dev._current_secondary = (
            _rng.uniform(dev.secondary_min, dev.secondary_max)
            if dev.secondary_min != dev.secondary_max
            else dev.secondary_min
        )

        _devices[dev.device_id] = dev
        _readings[dev.device_id] = []
        _latest[dev.device_id] = _generate_reading(dev)
        _device_enabled[dev.device_id] = True
        _sequence[dev.device_id] = 0

    logger.info("Initialized %d sensor devices", len(_devices))


# ---------------------------------------------------------------------------
# Reading generation
# ---------------------------------------------------------------------------


def _drift(
    current: float,
    target: float,
    max_step: float,
    min_val: float,
    max_val: float,
) -> float:
    """Move *current* toward *target* by at most *max_step*, then clamp."""
    if abs(current - target) < max_step:
        current = target
    elif current < target:
        current += _rng.uniform(0, max_step)
    else:
        current -= _rng.uniform(0, max_step)
    return max(min_val, min(max_val, current))


def _generate_reading(dev: SensorDevice) -> SensorReading:
    """Produce one reading for *dev*, mutating its internal drift state."""
    seq = _sequence.get(dev.device_id, 0)
    now = datetime.now(timezone.utc)

    # --- battery & signal decay -------------------------------------------
    if _rng.random() < 0.1:
        dev.battery_pct = max(0.0, dev.battery_pct - _rng.uniform(0.0, 0.5))
    # nudge signal up/down a little
    dev.signal_rssi_dbm += _rng.randint(-2, 2)
    dev.signal_rssi_dbm = max(-100, min(-30, dev.signal_rssi_dbm))

    # --- status simulation -------------------------------------------------
    if dev.battery_pct < 5.0:
        status = SensorStatus.OFFLINE
    elif dev.battery_pct < 15.0 or _rng.random() < 0.005:
        status = SensorStatus.DEGRADED
    else:
        status = SensorStatus.OK
    dev.status = status

    # --- value drift -------------------------------------------------------
    new_target = _rng.uniform(dev.value_min, dev.value_max)
    max_step = (dev.value_max - dev.value_min) * 0.05
    dev._current_value = _drift(dev._current_value, new_target, max_step, dev.value_min, dev.value_max)

    secondary: Optional[float] = None
    if dev.secondary_min != dev.secondary_max:
        sec_target = _rng.uniform(dev.secondary_min, dev.secondary_max)
        sec_step = (dev.secondary_max - dev.secondary_min) * 0.1
        dev._current_secondary = _drift(
            dev._current_secondary,
            sec_target,
            sec_step,
            dev.secondary_min,
            dev.secondary_max,
        )
        secondary = round(dev._current_secondary, 1)

    # --- motion / door / leak are boolean-ish ------------------------------
    value = dev._current_value
    if dev.sensor_type in (
        SensorType.MOTION,
        SensorType.DOOR_CONTACT,
        SensorType.LEAK,
    ):
        # Toggle occasionally
        if _rng.random() < 0.15:
            value = 1.0 if value < 0.5 else 0.0
            dev._current_value = value
        value = 1.0 if value >= 0.5 else 0.0
        if dev.sensor_type == SensorType.MOTION:
            secondary = _rng.randint(0, int(dev.secondary_max))

    reading = SensorReading(
        device_id=dev.device_id,
        sensor_type=dev.sensor_type,
        timestamp=now,
        sequence=seq,
        status=status,
        battery_pct=dev.battery_pct,
        signal_rssi_dbm=dev.signal_rssi_dbm,
        value=round(value, dev.value_decimals),
        unit=dev.value_unit,
        secondary_value=secondary,
        secondary_unit=dev.secondary_unit or None,
    )

    _sequence[dev.device_id] = seq + 1
    return reading


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_readings() -> Dict[str, SensorReading]:
    """Generate new readings for all enabled devices, store them, return latest."""
    generated: Dict[str, SensorReading] = {}
    for dev_id, dev in list(_devices.items()):
        if not _device_enabled.get(dev_id, True):
            continue
        reading = _generate_reading(dev)
        generated[dev_id] = reading
        _latest[dev_id] = reading
        hist = _readings[dev_id]
        hist.append(reading)
        if len(hist) > config.SENSOR_HISTORY_LIMIT:
            _readings[dev_id] = hist[-config.SENSOR_HISTORY_LIMIT :]
    return generated


def read_single(device_id: str) -> Optional[SensorReading]:
    """Force a single reading for a specific device."""
    dev = _devices.get(device_id)
    if dev is None:
        return None
    reading = _generate_reading(dev)
    _latest[device_id] = reading
    hist = _readings[device_id]
    hist.append(reading)
    if len(hist) > config.SENSOR_HISTORY_LIMIT:
        _readings[device_id] = hist[-config.SENSOR_HISTORY_LIMIT :]
    return reading


def get_devices() -> List[SensorDevice]:
    """Return all known sensor devices."""
    return list(_devices.values())


def get_device(device_id: str) -> Optional[SensorDevice]:
    """Return a single device by ID."""
    return _devices.get(device_id)


def get_latest(
    device_id: Optional[str] = None,
) -> Dict[str, SensorReading]:
    """Return latest reading(s). If device_id is None, return all."""
    if device_id:
        r = _latest.get(device_id)
        return {device_id: r} if r else {}
    return dict(_latest)


def get_history(device_id: str, limit: int = 100) -> List[SensorReading]:
    """Return recent history for a single device."""
    hist = _readings.get(device_id, [])
    return hist[-limit:]


def set_enabled(device_id: str, enabled: bool) -> bool:
    """Enable or disable automatic reading generation."""
    if device_id not in _device_enabled:
        return False
    _device_enabled[device_id] = enabled
    return True


def is_enabled(device_id: str) -> bool:
    """Check whether a device is currently enabled."""
    return _device_enabled.get(device_id, False)
