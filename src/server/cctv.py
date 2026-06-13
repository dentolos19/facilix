"""CCTV stream monitoring and ffmpeg capture helpers."""

from __future__ import annotations

import asyncio
import logging
import tempfile
import time
from pathlib import Path

from network import ffmpeg_input_options, probe_stream_url, rewrite_stream_host
from api import post_event, upload_frame, upload_segment

cctv_log = logging.getLogger("facilix.cctv")


async def monitor_cctv(
    device_id: str,
    device_name: str,
    stream_url: str,
    video_source: str = "simulation",
    simulation_stream: str = "",
    frame_enabled: bool = True,
    frame_interval_sec: int = 5,
    segment_enabled: bool = True,
    segment_interval_sec: int = 30,
    segment_duration_sec: int = 30,
) -> None:
    """
    Background task for a single CCTV device.

    Spawns two independent async loops per camera:
      - Frame loop: captures a JPEG every ``frame_interval_sec``
      - Segment loop: captures a short MP4 every ``segment_interval_sec``

    Both loops read the same RTSP/RTMP stream concurrently via ffmpeg.
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

    # Clamp intervals to safe ranges
    frame_interval_sec = max(1, frame_interval_sec)
    segment_interval_sec = max(5, segment_interval_sec)
    segment_duration_sec = max(5, min(300, segment_duration_sec))

    await post_event(
        device_id,
        "cctv:monitoring:started",
        "info",
        f"Started monitoring CCTV '{device_name}'",
        {
            "streamUrl": stream_url,
            "frameEnabled": frame_enabled,
            "frameIntervalSec": frame_interval_sec,
            "segmentEnabled": segment_enabled,
            "segmentIntervalSec": segment_interval_sec,
            "segmentDurationSec": segment_duration_sec,
        },
    )

    loops: list[asyncio.Task] = []

    if frame_enabled:
        loops.append(
            asyncio.create_task(
                _frame_loop(
                    device_id,
                    device_name,
                    stream_url,
                    frame_interval_sec,
                ),
                name=f"cctv-{device_id}-frames",
            )
        )

    if segment_enabled:
        loops.append(
            asyncio.create_task(
                _segment_loop(
                    device_id,
                    device_name,
                    stream_url,
                    segment_interval_sec,
                    segment_duration_sec,
                ),
                name=f"cctv-{device_id}-segments",
            )
        )

    if not loops:
        cctv_log.info("[%s] both frame and segment capture disabled — will idle", device_name)

    try:
        await asyncio.gather(*loops, return_exceptions=True)
    except asyncio.CancelledError:
        pass


# ── Frame loop (independent) ─────────────────────────────────────────────


async def _frame_loop(
    device_id: str,
    device_name: str,
    stream_url: str,
    interval_sec: int,
) -> None:
    """Continuously capture JPEG frames at the configured interval."""
    seq = 0
    while True:
        try:
            captured_at = time.time()
            cctv_log.info("[%s] capturing frame seq=%d from %s", device_name, seq + 1, stream_url)
            frame_timeout_sec = max(interval_sec, 15)
            frame_data, frame_err = await capture_frame(stream_url, timeout_sec=frame_timeout_sec)
            if frame_data:
                seq += 1
                cctv_log.info("[%s] frame ok seq=%d size=%d bytes", device_name, seq, len(frame_data))
                await upload_frame(
                    device_id, frame_data, seq, captured_at=captured_at
                )
            else:
                cctv_log.warning("[%s] frame capture failed: %s", device_name, frame_err)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            cctv_log.exception("[%s] frame loop error: %s", device_name, exc)
            await post_event(
                device_id, "cctv:error", "warn", f"Frame capture error: {exc}"
            )

        await asyncio.sleep(interval_sec)


# ── Segment loop (independent) ──────────────────────────────────────────


async def _segment_loop(
    device_id: str,
    device_name: str,
    stream_url: str,
    interval_sec: int,
    duration_sec: int,
) -> None:
    """Continuously capture video segments at the configured interval and duration."""
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
                    device_name, seq, len(segment_data), actual_duration,
                )
                await upload_segment(
                    device_id, segment_data, actual_duration, seq,
                    started_at=started_at, ended_at=ended_at,
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
            await post_event(
                device_id, "cctv:error", "warn", f"Segment capture error: {exc}"
            )

        await asyncio.sleep(interval_sec)


# ── ffmpeg helpers ─────────────────────────────────────────────────────────


async def capture_frame(stream_url: str, timeout_sec: int = 15) -> tuple[bytes | None, str]:
    """Use ffmpeg to capture a single JPEG frame from the stream.

    Returns ``(data, error_detail)``. ``error_detail`` is empty on success.
    """
    proc: asyncio.subprocess.Process | None = None
    t0 = time.monotonic()
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            *ffmpeg_input_options(stream_url),
            "-i",
            stream_url,
            "-frames:v",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "-q:v",
            "2",  # lower = higher quality for AI analysis (2-31 scale)
            "-",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_sec)
        dt_ms = (time.monotonic() - t0) * 1000
        if proc.returncode == 0 and len(stdout) > 100:
            cctv_log.debug("capture_frame ok %dB in %.0fms", len(stdout), dt_ms)
            return stdout, ""
        stderr_tail = (stderr or b"")[-500:].decode("utf-8", errors="replace").strip()
        detail = stderr_tail or f"ffmpeg_rc_{proc.returncode}_payload_{len(stdout)}B"
        cctv_log.warning(
            "capture_frame failed (rc=%s, %dB out, %.0fms) for %s: %s",
            proc.returncode, len(stdout), dt_ms, stream_url, stderr_tail,
        )
        return None, detail
    except TimeoutError:
        cctv_log.warning("capture_frame timed out after %ds for %s", timeout_sec, stream_url)
        if proc and proc.returncode is None:
            proc.kill()
            await proc.communicate()
        return None, "timeout"
    except FileNotFoundError:
        cctv_log.error("ffmpeg binary not found in container PATH")
        return None, "ffmpeg_not_found"


async def capture_segment(
    stream_url: str, duration_sec: int = 30
) -> tuple[bytes | None, float, float, float, str]:
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
            proc.returncode, dt_ms, stream_url, stderr_tail,
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
