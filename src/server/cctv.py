"""CCTV stream monitoring and ffmpeg capture helpers."""

from __future__ import annotations

import asyncio
import logging
import tempfile
import time
from pathlib import Path

from network import ffmpeg_input_options, probe_stream_url, rewrite_stream_host
from config import FRAME_INTERVAL_SEC, SEGMENT_DURATION_SEC, SEGMENT_INTERVAL_SEC
from api import post_event, upload_frame, upload_segment

cctv_log = logging.getLogger("facilix.cctv")


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

    await post_event(
        device_id,
        "cctv:monitoring:started",
        "info",
        f"Started monitoring CCTV '{device_name}'",
        {"streamUrl": stream_url},
    )

    frame_count = 0
    seq = 0  # monotonically increasing sequence counter per camera
    iteration = 0
    while True:
        iteration += 1
        try:
            cctv_log.info("[%s] iter=%d capturing frame from %s", device_name, iteration, stream_url)
            # ── Sample a single frame ──────────────────────────────────
            frame_data, frame_err = await capture_frame(stream_url)
            if frame_data:
                frame_count += 1
                seq += 1
                cctv_log.info("[%s] frame ok seq=%d size=%d bytes", device_name, seq, len(frame_data))
                await upload_frame(device_id, frame_data, seq)
            else:
                cctv_log.warning("[%s] frame capture failed: %s", device_name, frame_err)

            # ── Create a video segment ─────────────────────────────────
            should_segment = frame_count % (SEGMENT_INTERVAL_SEC // FRAME_INTERVAL_SEC) == 0
            cctv_log.debug(
                "[%s] segment gate frame_count=%d should_segment=%s",
                device_name,
                frame_count,
                should_segment,
            )
            if should_segment:
                cctv_log.info("[%s] capturing %ds segment from %s", device_name, SEGMENT_DURATION_SEC, stream_url)
                segment_data, duration, segment_error = await capture_segment(stream_url)
                if segment_data:
                    seq += 1
                    cctv_log.info(
                        "[%s] segment ok seq=%d size=%d bytes duration=%.1fs",
                        device_name,
                        seq,
                        len(segment_data),
                        duration,
                    )
                    await upload_segment(device_id, segment_data, duration, seq)
                else:
                    cctv_log.warning("[%s] segment capture failed: %s", device_name, segment_error)
                    await post_event(
                        device_id,
                        "cctv:segment:error",
                        "warn",
                        f"Failed to capture segment from '{device_name}'",
                        {
                            "streamUrl": stream_url,
                            "ffmpegStderr": segment_error,
                        },
                    )

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            cctv_log.exception("[%s] loop error: %s", device_name, exc)
            await post_event(
                device_id,
                "cctv:error",
                "warn",
                f"CCTV monitoring error: {exc}",
            )

        await asyncio.sleep(FRAME_INTERVAL_SEC)


async def capture_frame(stream_url: str) -> tuple[bytes | None, str]:
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
            "5",  # low quality = small payload
            "-",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=FRAME_INTERVAL_SEC)
        dt_ms = (time.monotonic() - t0) * 1000
        if proc.returncode == 0 and len(stdout) > 100:
            cctv_log.debug("capture_frame ok %dB in %.0fms", len(stdout), dt_ms)
            return stdout, ""
        stderr_tail = (stderr or b"")[-500:].decode("utf-8", errors="replace").strip()
        detail = stderr_tail or f"ffmpeg_rc_{proc.returncode}_payload_{len(stdout)}B"
        cctv_log.warning(
            "capture_frame failed (rc=%s, %dB out, %.0fms) for %s: %s",
            proc.returncode,
            len(stdout),
            dt_ms,
            stream_url,
            stderr_tail,
        )
        return None, detail
    except TimeoutError:
        cctv_log.warning("capture_frame timed out after %ds for %s", FRAME_INTERVAL_SEC, stream_url)
        if proc and proc.returncode is None:
            proc.kill()
            await proc.communicate()
        return None, "timeout"
    except FileNotFoundError:
        cctv_log.error("ffmpeg binary not found in container PATH")
        return None, "ffmpeg_not_found"


async def capture_segment(stream_url: str) -> tuple[bytes | None, float, str]:
    """Use ffmpeg to capture a short video segment.

    Returns (data, duration_sec, error_detail). On failure the bytes are None
    and ``error_detail`` holds the ffmpeg stderr tail (or a synthetic reason
    like ``timeout``/``ffmpeg_not_found``) so callers can surface it.
    """
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp_path = tmp.name
    proc: asyncio.subprocess.Process | None = None
    t0 = time.monotonic()
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        *ffmpeg_input_options(stream_url),
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
    ]
    cctv_log.debug("capture_segment cmd: %s", " ".join(cmd))
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=SEGMENT_DURATION_SEC + 10)
        dt_ms = (time.monotonic() - t0) * 1000
        if proc.returncode == 0:
            data = await asyncio.to_thread(Path(tmp_path).read_bytes)
            cctv_log.info("capture_segment ok %dB in %.0fms for %s", len(data), dt_ms, stream_url)
            return data, float(SEGMENT_DURATION_SEC), ""
        stderr_tail = (stderr or b"")[-500:].decode("utf-8", errors="replace").strip()
        cctv_log.warning(
            "capture_segment failed (rc=%s, %.0fms) for %s: %s",
            proc.returncode,
            dt_ms,
            stream_url,
            stderr_tail,
        )
        return None, 0.0, stderr_tail or f"ffmpeg_rc_{proc.returncode}"
    except TimeoutError:
        cctv_log.warning("capture_segment timed out for %s", stream_url)
        if proc and proc.returncode is None:
            proc.kill()
            await proc.communicate()
        return None, 0.0, "timeout"
    except FileNotFoundError:
        cctv_log.error("ffmpeg binary not found in container PATH")
        return None, 0.0, "ffmpeg_not_found"
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except OSError:
            pass
