"""CCTV stream monitoring and ffmpeg segment capture helpers."""

from __future__ import annotations

import asyncio
import logging
import tempfile
import time
from pathlib import Path

from network import ffmpeg_input_options, probe_stream_url, rewrite_stream_host
from api import post_event, upload_segment

cctv_log = logging.getLogger("facilix.cctv")


async def monitor_cctv(
    device_id: str,
    device_name: str,
    stream_url: str,
    video_source: str = "simulation",
    simulation_stream: str = "",
    segment_duration_sec: int = 30,
) -> None:
    """
    Background task for a single CCTV device.

    Continuously captures video segments from the stream, splitting it into
    clips of the specified duration. Each segment is uploaded for processing.
    """
    # Rewrite host-relative URLs (the Worker returns rtsp://localhost:... for
    # simulation, but inside this container localhost is unreachable).
    rewritten = rewrite_stream_host(stream_url)
    if rewritten != stream_url:
        cctv_log.info("[%s] rewrote stream URL: %s -> %s", device_name, stream_url, rewritten)
        stream_url = rewritten

    # Sanity-check reachability before we start the loop so the operator sees
    # why subsequent ffmpeg invocations fail.
    if stream_url:
        await probe_stream_url(stream_url)

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

    # Clamp duration to safe range
    segment_duration_sec = max(5, min(300, segment_duration_sec))

    await post_event(
        device_id,
        "cctv:monitoring:started",
        "info",
        f"Started monitoring CCTV '{device_name}'",
        {
            "streamUrl": stream_url,
            "segmentDurationSec": segment_duration_sec,
        },
    )

    try:
        await _segment_loop(
            device_id,
            device_name,
            stream_url,
            segment_duration_sec,
        )
    except asyncio.CancelledError:
        pass


# ── Segment loop ──────────────────────────────────────────────────────────


async def _segment_loop(
    device_id: str,
    device_name: str,
    stream_url: str,
    duration_sec: int,
) -> None:
    """Continuously capture video segments, splitting the stream into clips."""
    seq = 0
    while True:
        try:
            cctv_log.info("[%s] capturing %ds segment from %s", device_name, duration_sec, stream_url)
            segment_data, actual_duration, started_at, ended_at, segment_error = await capture_segment(
                stream_url, duration_sec
            )
            if segment_data:
                seq += 1
                cctv_log.info(
                    "[%s] segment ok seq=%d size=%d bytes duration=%.1fs",
                    device_name,
                    seq,
                    len(segment_data),
                    actual_duration,
                )
                await upload_segment(
                    device_id,
                    segment_data,
                    actual_duration,
                    seq,
                    started_at=started_at,
                    ended_at=ended_at,
                )
            else:
                cctv_log.warning("[%s] segment capture failed: %s", device_name, segment_error)
                await post_event(
                    device_id,
                    "cctv:segment:error",
                    "warn",
                    f"Failed to capture segment from '{device_name}'",
                    {"streamUrl": stream_url, "ffmpegStderr": segment_error},
                )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            cctv_log.exception("[%s] segment loop error: %s", device_name, exc)
            await post_event(device_id, "cctv:error", "warn", f"Segment capture error: {exc}")


# ── ffmpeg helpers ─────────────────────────────────────────────────────────


async def capture_segment(stream_url: str, duration_sec: int = 30) -> tuple[bytes | None, float, float, float, str]:
    """Use ffmpeg to capture a short video segment.

    Returns (data, actual_duration_sec, started_at_monotonic, ended_at_monotonic, error_detail).
    On failure the bytes are None.
    """
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp_path = tmp.name
    proc: asyncio.subprocess.Process | None = None
    started_at = time.time()
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        *ffmpeg_input_options(stream_url),
        "-i",
        stream_url,
        "-t",
        str(duration_sec),
        "-c",
        "copy",
        "-f",
        "mp4",
        "-movflags",
        "frag_keyframe+empty_moov",
        "-y",
        tmp_path,
    ]
    cctv_log.debug("capture_segment cmd: %s", " ".join(cmd))
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=duration_sec + 15)
        ended_at = time.time()
        actual_duration = ended_at - started_at
        dt_ms = int(actual_duration * 1000)
        if proc.returncode == 0:
            data = await asyncio.to_thread(Path(tmp_path).read_bytes)
            cctv_log.info("capture_segment ok %dB in %dms for %s", len(data), dt_ms, stream_url)
            return data, actual_duration, started_at, ended_at, ""
        stderr_tail = (stderr or b"")[-500:].decode("utf-8", errors="replace").strip()
        cctv_log.warning(
            "capture_segment failed (rc=%s, %dms) for %s: %s",
            proc.returncode,
            dt_ms,
            stream_url,
            stderr_tail,
        )
        return None, 0.0, 0.0, 0.0, stderr_tail or f"ffmpeg_rc_{proc.returncode}"
    except TimeoutError:
        ended_at = time.time()
        cctv_log.warning("capture_segment timed out for %s", stream_url)
        if proc and proc.returncode is None:
            proc.kill()
            await proc.communicate()
        return None, 0.0, 0.0, 0.0, "timeout"
    except FileNotFoundError:
        ended_at = time.time()
        cctv_log.error("ffmpeg binary not found in container PATH")
        return None, 0.0, 0.0, 0.0, "ffmpeg_not_found"
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except OSError:
            pass
