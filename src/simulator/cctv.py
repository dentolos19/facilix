"""CCTV Simulator — loops local MP4 files and publishes them as
RTSP/RTMP streams via MediaMTX, then proxies HLS for browser playback.

Video discovery is driven by a manifest file (videos.json) that
describes available samples, with filesystem fallback for unlisted MP4s.
"""

from __future__ import annotations

import asyncio
import json
import logging
import signal
import socket
import time
from collections import deque
from pathlib import Path
from typing import Dict, List, Optional

import fastapi
import urllib.error
import urllib.parse
import urllib.request
from fastapi.responses import JSONResponse, StreamingResponse

import config
from control import require_token

logger = logging.getLogger("simulator.cctv")

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

StreamState = Dict[str, "StreamProcess"]


class VideoInfo:
    """Metadata about a discovered video from the manifest or filesystem."""

    def __init__(
        self,
        video_id: str,
        file: str,
        video_path: str,
        label: str = "",
        description: str = "",
        tags: Optional[List[str]] = None,
    ) -> None:
        self.video_id = video_id
        self.file = file
        self.video_path = video_path
        self.label = label or video_id
        self.description = description
        self.tags = tags or []

    def to_dict(self) -> dict:
        return {
            "id": self.video_id,
            "file": self.file,
            "video_path": self.video_path,
            "label": self.label,
            "description": self.description,
            "tags": self.tags,
        }


class StreamProcess:
    """Holds the subprocess and metadata for one camera stream."""

    def __init__(
        self,
        name: str,
        video_path: str,
        video_info: Optional[VideoInfo] = None,
    ) -> None:
        self.name = name
        self.video_path = video_path
        self.video_info = video_info
        self.process: Optional[asyncio.subprocess.Process] = None
        self.use_copy = True
        self.enabled = False
        self.hls_ready = False
        self.hls_error = "stream_stopped"
        self.hls_checked_at: float | None = None
        self._lock = asyncio.Lock()
        self._max_restarts = 5
        self._restart_window = 60.0
        self._restart_attempts: deque[float] = deque()

    @property
    def rtsp_url(self) -> str:
        return f"rtsp://{config.MEDIAMTX_HOST}:{config.MEDIAMTX_RTSP_PORT}/{self.name}"

    @property
    def rtmp_url(self) -> str:
        return f"rtmp://{config.MEDIAMTX_HOST}:{config.MEDIAMTX_RTMP_PORT}/{self.name}"

    @property
    def is_alive(self) -> bool:
        return self.process is not None and self.process.returncode is None

    @property
    def status(self) -> str:
        if not self.enabled:
            return "stopped"
        if self.is_alive and self.hls_ready:
            return "running"
        if self.is_alive:
            return "starting"
        return "error"

    def info(self) -> dict:
        base: dict = {
            "name": self.name,
            "video_path": self.video_path,
            "alive": self.is_alive,
            "status": self.status,
            "hls_ready": self.hls_ready,
            "hls_error": self.hls_error or None,
            "rtsp_url": self.rtsp_url,
            "rtmp_url": self.rtmp_url,
        }
        if self.video_info:
            base["label"] = self.video_info.label
            base["description"] = self.video_info.description
            base["tags"] = self.video_info.tags
            base["file"] = self.video_info.file
        return base

    def can_restart(self) -> bool:
        """Limit restart storms without permanently abandoning a stream."""
        now = asyncio.get_running_loop().time()
        while self._restart_attempts and self._restart_attempts[0] <= now - self._restart_window:
            self._restart_attempts.popleft()

        if len(self._restart_attempts) >= self._max_restarts:
            return False

        self._restart_attempts.append(now)
        return True


# ---------------------------------------------------------------------------
# Video manifest loading
# ---------------------------------------------------------------------------


def _load_video_manifest() -> dict[str, VideoInfo]:
    """Load video metadata from the manifest JSON file.

    Returns a dict keyed by video id.
    """
    manifest_path = Path(config.VIDEOS_MANIFEST)
    result: dict[str, VideoInfo] = {}

    if not manifest_path.is_file():
        logger.warning(
            "Video manifest %s not found, using filesystem discovery only",
            manifest_path,
        )
        return result

    try:
        with open(manifest_path) as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to parse video manifest %s: %s", manifest_path, exc)
        return result

    videos = data if isinstance(data, list) else data.get("videos", [])
    samples_dir = Path(config.SAMPLES_DIR)

    for entry in videos:
        video_id = entry.get("id", "")
        file_name = entry.get("file", "")
        if not video_id or not file_name:
            logger.warning("Skipping manifest entry with missing id or file: %s", entry)
            continue

        if not file_name.endswith(".mp4"):
            logger.warning("Skipping non-MP4 file in manifest: %s", file_name)
            continue

        video_path = (samples_dir / file_name).resolve()
        try:
            video_path.relative_to(samples_dir.resolve())
        except ValueError:
            logger.warning(
                "Skipping manifest entry with path outside samples dir: %s",
                file_name,
            )
            continue

        if not video_path.is_file():
            logger.warning(
                "Manifest entry '%s' points to non-existent file: %s",
                video_id,
                video_path,
            )
            continue

        result[video_id] = VideoInfo(
            video_id=video_id,
            file=file_name,
            video_path=str(video_path),
            label=entry.get("label", video_id),
            description=entry.get("description", ""),
            tags=entry.get("tags", []),
        )

    logger.info("Loaded %d video(s) from manifest", len(result))
    return result


def _discover_videos() -> List[VideoInfo]:
    """Discover MP4 videos from the videos directory.

    First tries the manifest, then falls back to globbing ``*.mp4``.
    For unlisted files, generates minimal metadata from the filename.
    """
    manifest_videos = _load_video_manifest()
    samples_dir = Path(config.SAMPLES_DIR)
    seen: set[str] = set()
    result: List[VideoInfo] = []

    for vid, info in manifest_videos.items():
        result.append(info)
        seen.add(vid)

    if not samples_dir.is_dir():
        logger.warning("Samples directory %s does not exist", samples_dir)
        return result

    for fpath in sorted(samples_dir.glob("*.mp4")):
        stem = fpath.stem
        if stem in seen:
            continue
        result.append(
            VideoInfo(
                video_id=stem,
                file=fpath.name,
                video_path=str(fpath),
                label=stem,
                description=f"Discovered video: {fpath.name}",
                tags=["discovered"],
            )
        )
        seen.add(stem)

    logger.info("Discovered %d video(s) total in %s", len(result), samples_dir)
    return result


# ---------------------------------------------------------------------------
# Stream manager
# ---------------------------------------------------------------------------

streams: StreamState = {}
_shutdown_event = asyncio.Event()
_stderr_tasks: set[asyncio.Task] = set()


def _build_ffmpeg_args(sp: StreamProcess) -> List[str]:
    """Build FFmpeg arguments for a stream."""
    if sp.use_copy:
        args = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-re",
            "-stream_loop",
            "-1",
            "-i",
            sp.video_path,
            "-c",
            "copy",
            "-f",
            "rtsp",
            sp.rtsp_url,
        ]
    else:
        args = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-re",
            "-stream_loop",
            "-1",
            "-i",
            sp.video_path,
            *config.FALLBACK_ENCODE_ARGS,
            "-f",
            "rtsp",
            sp.rtsp_url,
        ]
    return args


async def _start_stream(sp: StreamProcess) -> None:
    """Start (or restart) a single FFmpeg subprocess."""
    if sp.is_alive:
        logger.info("Stream '%s' already running, skipping", sp.name)
        return

    args = _build_ffmpeg_args(sp)
    logger.info(
        "Starting stream '%s' (copy=%s): %s",
        sp.name,
        sp.use_copy,
        " ".join(args),
    )

    sp.process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )

    task = asyncio.ensure_future(_monitor_stream_stderr(sp))
    _stderr_tasks.add(task)
    task.add_done_callback(_stderr_tasks.discard)
    sp.hls_ready = False
    sp.hls_error = "hls_starting"
    sp.hls_checked_at = None


async def _monitor_stream_stderr(sp: StreamProcess) -> None:
    """Read FFmpeg stderr and log it; detect codec-copy failure for fallback."""
    assert sp.process is not None and sp.process.stderr is not None
    try:
        while True:
            line = await sp.process.stderr.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="replace").rstrip()
            if sp.use_copy and "codec" in text.lower() and "not" in text.lower():
                logger.warning(
                    "Stream '%s': codec copy failed, falling back to re-encode",
                    sp.name,
                )
                sp.use_copy = False
                asyncio.ensure_future(_restart_stream(sp))
                return
            if text:
                logger.debug("[%s] %s", sp.name, text)
    except (BrokenPipeError, ConnectionResetError):
        pass


async def _stop_stream(sp: StreamProcess) -> None:
    """Stop a stream gracefully."""
    if sp.process is None:
        sp.hls_ready = False
        sp.hls_error = "stream_stopped"
        sp.hls_checked_at = time.monotonic()
        return
    try:
        sp.process.send_signal(signal.SIGTERM)
        try:
            await asyncio.wait_for(sp.process.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            logger.warning("Stream '%s' did not exit, killing", sp.name)
            sp.process.kill()
            await sp.process.wait()
    except ProcessLookupError:
        pass
    sp.process = None
    sp.hls_ready = False
    sp.hls_error = "stream_stopped"
    sp.hls_checked_at = time.monotonic()


async def _restart_stream(sp: StreamProcess) -> None:
    """Restart a stream (stop then start). Single-flight per stream."""
    async with sp._lock:
        await _stop_stream(sp)
        await _start_stream(sp)


async def initialize_streams() -> None:
    """Discover videos without publishing them until explicitly requested."""
    videos = _discover_videos()
    for vinfo in videos:
        name = vinfo.video_id
        sp = StreamProcess(name=name, video_path=vinfo.video_path, video_info=vinfo)
        streams[name] = sp


def _hls_playlist_url(name: str) -> str:
    return f"{config.MEDIAMTX_HLS_URL.rstrip('/')}/{urllib.parse.quote(name)}/index.m3u8"


def _fetch_hls_playlist(name: str) -> None:
    with urllib.request.urlopen(_hls_playlist_url(name), timeout=config.HLS_HEALTH_TIMEOUT_SECONDS) as response:
        if response.status != 200:
            raise urllib.error.HTTPError(response.url, response.status, "Unexpected HLS status", response.headers, None)
        if b"#EXTM3U" not in response.read(256):
            raise ValueError("invalid_hls_playlist")


async def _probe_hls(sp: StreamProcess) -> bool:
    """Update cached HLS readiness without delaying request handlers."""
    if not sp.enabled or not sp.is_alive:
        sp.hls_ready = False
        sp.hls_error = "stream_not_running"
        return False

    try:
        await asyncio.to_thread(_fetch_hls_playlist, sp.name)
    except (TimeoutError, socket.timeout):
        sp.hls_ready = False
        sp.hls_error = "hls_timeout"
    except urllib.error.HTTPError as exc:
        sp.hls_ready = False
        sp.hls_error = f"hls_http_{exc.code}"
    except urllib.error.URLError as exc:
        sp.hls_ready = False
        sp.hls_error = f"hls_unreachable:{exc.reason}"
    except ValueError as exc:
        sp.hls_ready = False
        sp.hls_error = str(exc)
    else:
        sp.hls_ready = True
        sp.hls_error = ""
    finally:
        sp.hls_checked_at = time.monotonic()

    return sp.hls_ready


async def _wait_for_hls(sp: StreamProcess) -> bool:
    deadline = time.monotonic() + config.HLS_STARTUP_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if await _probe_hls(sp):
            return True
        if not sp.is_alive:
            return False
        await asyncio.sleep(0.5)
    return False


def health_summary() -> dict:
    """Return cached stream and HLS readiness suitable for fast health routes."""
    configured = len(streams)
    requested = [sp for sp in streams.values() if sp.enabled]
    running = sum(1 for sp in requested if sp.is_alive)
    hls_ready = sum(1 for sp in requested if sp.hls_ready)
    failed = sum(1 for sp in requested if sp.status == "error")
    starting = sum(1 for sp in requested if sp.status == "starting")
    return {
        "status": "ok" if not requested or hls_ready == len(requested) else "degraded",
        "total": configured,
        "requested": len(requested),
        "running": running,
        "hlsReady": hls_ready,
        "starting": starting,
        "failed": failed,
    }


async def health_loop() -> None:
    """Periodically check FFmpeg health and restart dead streams."""
    while not _shutdown_event.is_set():
        for name, sp in list(streams.items()):
            if not sp.enabled:
                continue
            if not sp.is_alive and sp.process is not None:
                return_code = sp.process.returncode
                logger.warning(
                    "Stream '%s' exited (code %s), restarting",
                    name,
                    return_code,
                )
                if sp.can_restart():
                    asyncio.ensure_future(_restart_stream(sp))
                else:
                    logger.error(
                        "Stream '%s' exceeded %d restarts in %.0f seconds",
                        name,
                        sp._max_restarts,
                        sp._restart_window,
                    )
            elif sp.is_alive:
                await _probe_hls(sp)
        try:
            await asyncio.wait_for(_shutdown_event.wait(), timeout=config.HEALTH_CHECK_INTERVAL)
        except asyncio.TimeoutError:
            pass


async def shutdown_streams() -> None:
    """Graceful shutdown: stop all streams and cancel monitor tasks."""
    logger.info("Shutting down all streams…")
    _shutdown_event.set()

    for task in list(_stderr_tasks):
        task.cancel()
    for task in list(_stderr_tasks):
        try:
            await task
        except asyncio.CancelledError:
            pass

    for name, sp in list(streams.items()):
        await _stop_stream(sp)

    _stderr_tasks.clear()
    streams.clear()
    logger.info("All streams stopped")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

router = fastapi.APIRouter(prefix="/cctv", tags=["cctv"])


@router.get("")
async def list_streams() -> JSONResponse:
    """List all CCTV streams with metadata."""
    return JSONResponse({"streams": [sp.info() for sp in streams.values()]})


@router.get("/health")
async def cctv_health() -> JSONResponse:
    """CCTV-only health check."""
    return JSONResponse(health_summary())


@router.get("/{name}")
async def get_stream(name: str) -> JSONResponse:
    """Get details for a single CCTV stream."""
    sp = streams.get(name)
    if sp is None:
        return JSONResponse({"error": f"Stream '{name}' not found"}, status_code=404)
    return JSONResponse(sp.info())


@router.post("/{name}/start")
async def start_stream(name: str, _: None = fastapi.Depends(require_token)) -> JSONResponse:
    """Start a CCTV stream."""
    sp = streams.get(name)
    if sp is None:
        return JSONResponse({"error": f"Stream '{name}' not found"}, status_code=404)
    async with sp._lock:
        sp.enabled = True
        await _start_stream(sp)
        ready = await _wait_for_hls(sp)
    return JSONResponse({"status": sp.status, "stream": sp.info()}, status_code=200 if ready else 202)


@router.post("/{name}/stop")
async def stop_stream(name: str, _: None = fastapi.Depends(require_token)) -> JSONResponse:
    """Stop a CCTV stream."""
    sp = streams.get(name)
    if sp is None:
        return JSONResponse({"error": f"Stream '{name}' not found"}, status_code=404)
    async with sp._lock:
        sp.enabled = False
        await _stop_stream(sp)
    return JSONResponse({"status": "stopped", "stream": sp.info()})


@router.post("/{name}/restart")
async def restart_stream(name: str, _: None = fastapi.Depends(require_token)) -> JSONResponse:
    """Restart a CCTV stream."""
    sp = streams.get(name)
    if sp is None:
        return JSONResponse({"error": f"Stream '{name}' not found"}, status_code=404)
    sp.enabled = True
    await _restart_stream(sp)
    ready = await _wait_for_hls(sp)
    return JSONResponse({"status": sp.status, "stream": sp.info()}, status_code=200 if ready else 202)


@router.get("/{name}/hls/{hls_path:path}")
async def proxy_hls(name: str, hls_path: str, request: fastapi.Request) -> fastapi.Response:
    """Proxy MediaMTX HLS output through FastAPI so only one HTTP port is needed.

    Streams the response instead of buffering the entire segment in memory.
    """
    if name not in streams:
        raise fastapi.HTTPException(status_code=404, detail=f"Stream '{name}' not found")
    if not streams[name].enabled:
        raise fastapi.HTTPException(status_code=503, detail="HLS stream is stopped")

    if ".." in hls_path.split("/"):
        raise fastapi.HTTPException(status_code=400, detail="Invalid HLS path")

    encoded_path = urllib.parse.quote(f"{name}/{hls_path}", safe="/.")
    upstream_url = f"{config.MEDIAMTX_HLS_URL.rstrip('/')}/{encoded_path}"
    if request.url.query:
        upstream_url = f"{upstream_url}?{request.url.query}"

    try:
        upstream_resp = await asyncio.to_thread(
            urllib.request.urlopen,
            upstream_url,
            timeout=config.MEDIAMTX_HLS_TIMEOUT_SECONDS,
        )
        content_type = upstream_resp.headers.get("content-type", "application/octet-stream")
        return StreamingResponse(
            _stream_response(upstream_resp),
            media_type=content_type,
            status_code=upstream_resp.status,
        )
    except (TimeoutError, socket.timeout) as exc:
        raise fastapi.HTTPException(status_code=504, detail="MediaMTX HLS request timed out") from exc
    except urllib.error.HTTPError as exc:
        raise fastapi.HTTPException(status_code=502, detail="MediaMTX HLS resource unavailable") from exc
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, (TimeoutError, socket.timeout)):
            raise fastapi.HTTPException(status_code=504, detail="MediaMTX HLS request timed out") from exc
        raise fastapi.HTTPException(status_code=502, detail="MediaMTX HLS endpoint unavailable") from exc


def _stream_response(resp):
    """Yield chunks from urllib response to avoid buffering."""
    try:
        while chunk := resp.read(65536):
            yield chunk
    finally:
        resp.close()
