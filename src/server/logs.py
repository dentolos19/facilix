"""
Consistent logging utilities for Facilix services.

Two formatters are available:

- **ConsoleFormatter** (default) — compact human-readable output for terminals and container logs
- **JsonFormatter** — structured JSON matching the TypeScript logger for log aggregation

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

        2026-06-17T13:40:15.123Z  INFO   monitoring starting
        2026-06-17T13:40:15.123Z  WARN   missing env vars: FACILITY_ID
        2026-06-17T13:40:15.123Z  ERROR  upload failed  {"assetId":"abc-123"}
        2026-06-17T13:40:15.123Z  ERROR  something broke  ZeroDivisionError: division by zero
    """

    def format(self, record: logging.LogRecord) -> str:
        timestamp = _format_timestamp(record.created)
        level = _format_level(record.levelname).upper()
        line = f"{timestamp}  {level:<5}  {_single_line(record.getMessage())}"

        # Keep structured context on the same line so collectors treat it as one event.
        data = getattr(record, "data", None)
        if isinstance(data, dict) and data:
            line += f"  {json.dumps(data, default=str, ensure_ascii=False, separators=(',', ':'))}"

        if record.exc_info and record.exc_info[0] is not None:
            exc = record.exc_info[1]
            line += f"  {type(exc).__name__}: {_single_line(exc)}"

        return line


# ---------------------------------------------------------------------------
# JSON formatter — compact single-line for log aggregation
# ---------------------------------------------------------------------------


class JsonFormatter(logging.Formatter):
    """Emit log records as single-line JSON matching the TypeScript logger.

    Fields:
        timestamp — UTC ISO-8601 with Z suffix
        level     — lowercase level name (debug|info|warn|error)
        message   — formatted log message (% args resolved)
        data      — structured context     (only when extra={"data": {...}})
        exception — structured error details (only when exc_info is set)
    """

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "timestamp": _format_timestamp(record.created),
            "level": _format_level(record.levelname),
            "message": record.getMessage(),
        }

        data = getattr(record, "data", None)
        if isinstance(data, dict) and data:
            entry["data"] = data

        if record.exc_info and record.exc_info[0] is not None:
            exc = record.exc_info[1]
            entry["exception"] = {
                "type": type(exc).__name__,
                "message": str(exc),
                "stack": "".join(traceback.format_exception(*record.exc_info)).rstrip(),
            }

        return json.dumps(entry, default=str, ensure_ascii=False, separators=(",", ":"))


# ---------------------------------------------------------------------------
# One-shot setup
# ---------------------------------------------------------------------------

_FORMATTERS = {
    "console": ConsoleFormatter,
    "json": JsonFormatter,
}

_installed_formatter: type[logging.Formatter] | None = None


def _format_timestamp(created: float) -> str:
    return datetime.fromtimestamp(created, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _format_level(level: str) -> str:
    return {"WARNING": "warn", "CRITICAL": "error"}.get(level, level.lower())


def _single_line(value: Any) -> str:
    return str(value).replace("\r", "\\r").replace("\n", "\\n")


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

    cls = _FORMATTERS.get(fmt.lower())
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
