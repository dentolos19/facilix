"""
Logging utilities for Facilix Python services.

Two formatters are available:

- **ConsoleFormatter** (default) — clean human-readable output for terminals / docker logs
- **JsonFormatter** — compact JSON matching the TypeScript logger for log aggregation

Usage:
    from logs import configure_logging, ConsoleFormatter, JsonFormatter

    configure_logging("INFO")                        # ConsoleFormatter (default)
    configure_logging("INFO", fmt="json")            # JsonFormatter for machine parsing

    log = logging.getLogger("my.module")
    log.info("hello %s", "world")
    log.warning("problem", extra={"data": {"key": "val"}})
"""

from __future__ import annotations

import json
import logging
import os
import traceback
from datetime import datetime, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Console formatter — clean human-readable output
# ---------------------------------------------------------------------------

class ConsoleFormatter(logging.Formatter):
    """Emit log records in a clean human-readable format.

    Output::

        2026-06-17T13:40:15Z  INFO  [facilix]  monitoring starting
        2026-06-17T13:40:15Z  WARN  [facilix]  missing env vars: FACILITY_ID
        2026-06-17T13:40:15Z ERROR  [facilix.cctv]  upload failed  {"assetId":"abc-123"}
        2026-06-17T13:40:15Z ERROR  [test]  something broke
          \u2502 ZeroDivisionError: division by zero
    """

    def format(self, record: logging.LogRecord) -> str:
        timestamp = datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        level = record.levelname.lower()
        namespace = record.name
        message = record.getMessage()

        parts = [f"{timestamp}  {level:<5}  [{namespace}]  {message}"]

        # Append structured data if the caller passed extra={"data": {...}}
        data = getattr(record, "data", None)
        if isinstance(data, dict) and data:
            parts.append(f"  {json.dumps(data, default=str, separators=(',', ':'))}")

        # Append exception summary on a continuation line
        if record.exc_info and record.exc_info[0] is not None:
            exc = record.exc_info[1]
            parts.append(f"\n  \u2502 {type(exc).__name__}: {exc}")

        return "\n".join(parts)


# ---------------------------------------------------------------------------
# JSON formatter — compact single-line for log aggregation
# ---------------------------------------------------------------------------

class JsonFormatter(logging.Formatter):
    """Emit log records as single-line JSON matching the TypeScript logger.

    Fields:
        level     — lowercase level name  (debug|info|warn|error)
        namespace — logger name            (e.g. "facilix.cctv")
        message   — formatted log message  (% args resolved)
        timestamp — UTC ISO-8601 with Z suffix
        exception — full traceback string  (only when exc_info is set)
        data      — structured context     (only when extra={"data": {...}})
    """

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "level": record.levelname.lower(),
            "namespace": record.name,
            "message": record.getMessage(),
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        if record.exc_info and record.exc_info[0] is not None:
            entry["exception"] = "".join(traceback.format_exception(*record.exc_info))

        data = getattr(record, "data", None)
        if isinstance(data, dict) and data:
            entry["data"] = data

        return json.dumps(entry, default=str, ensure_ascii=False, separators=(",", ":"))


# ---------------------------------------------------------------------------
# One-shot setup
# ---------------------------------------------------------------------------

_FORMATTERS = {
    "console": ConsoleFormatter,
    "json": JsonFormatter,
}

_installed_formatter: type[logging.Formatter] | None = None


def configure_logging(level: str | None = None, fmt: str | None = None) -> None:
    """Configure the root logger with a human-readable stream handler.

    Parameters
    ----------
    level : str, optional
        Log level (e.g. ``"INFO"``, ``"DEBUG"``).  Falls back to the
        ``LOG_LEVEL`` env var, then ``"INFO"``.
    fmt : str, optional
        ``"console"`` (default) or ``"json"``.  Falls back to the
        ``LOG_FORMAT`` env var.

    This is safe to call multiple times — it will not duplicate handlers
    if the same formatter type is already installed.
    """
    if level is None:
        level = os.environ.get("LOG_LEVEL", "INFO")
    if fmt is None:
        fmt = os.environ.get("LOG_FORMAT", "console")

    cls = _FORMATTERS.get(fmt)
    if cls is None:
        cls = ConsoleFormatter

    root = logging.getLogger()
    root.setLevel(level.upper())

    global _installed_formatter
    if _installed_formatter is cls:
        return  # same formatter already installed

    # Replace existing stream handlers
    for h in root.handlers[:]:
        if isinstance(h, logging.StreamHandler):
            root.removeHandler(h)

    handler = logging.StreamHandler()
    handler.setFormatter(cls())
    root.addHandler(handler)
    _installed_formatter = cls
