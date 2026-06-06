"""CCTV Simulator — loops local MP4 files and publishes them as
RTSP/RTMP streams via MediaMTX.

Video discovery is driven by a manifest file (videos.json) that
describes available samples, with filesystem fallback for unlisted MP4s.
"""

from __future__ import annotations

import asyncio
import json
import logging
import signal
from pathlib import Path
from typing import Dict, List, Optional

import fastapi
from fastapi.responses import JSONResponse

import config

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
        self.use_copy = True  # try stream-copy first, fall back to re-encode

    @property
    def rtsp_url(self) -> str:
        return f"rtsp://{config.MEDIAMTX_HOST}:{config.MEDIAMTX_RTSP_PORT}/{self.name}"

    @property
    def rtmp_url(self) -> str:
        return f"rtmp://{config.MEDIAMTX_HOST}:{config.MEDIAMTX_RTMP_PORT}/{self.name}"

    @property
    def is_alive(self) -> bool:
        return self.process is not None and self.process.returncode is None

    def info(self) -> dict:
        base: dict = {
            "name": self.name,
            "video_path": self.video_path,
            "alive": self.is_alive,
            "rtsp_url": self.rtsp_url,
            "rtmp_url": self.rtmp_url,
            "use_copy": self.use_copy,
        }
        if self.video_info:
            base["label"] = self.video_info.label
            base["description"] = self.video_info.description
            base["tags"] = self.video_info.tags
            base["file"] = self.video_info.file
        return base


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
    video_dir = Path(config.VIDEOS_DIR)
    seen: set[str] = set()
    result: List[VideoInfo] = []

    # Emit manifest entries that have existing files
    for vid, info in manifest_videos.items():
        result.append(info)
        seen.add(vid)

    # Discover remaining MP4 files not in the manifest
    if not video_dir.is_dir():
        logger.warning("Videos directory %s does not exist", video_dir)
        return result

    for fpath in sorted(video_dir.glob("*.mp4")):
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

    logger.info("Discovered %d video(s) total in %s", len(result), video_dir)
    return result


# ---------------------------------------------------------------------------
# Stream manager
# ---------------------------------------------------------------------------

streams: StreamState = {}
_shutdown_event = asyncio.Event()


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

    # Read stderr asynchronously so we can see codec errors
    asyncio.ensure_future(_monitor_stream_stderr(sp))


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


async def _restart_stream(sp: StreamProcess) -> None:
    """Restart a stream (stop then start)."""
    await _stop_stream(sp)
    await _start_stream(sp)


async def initialize_streams() -> None:
    """Discover videos and start all streams."""
    videos = _discover_videos()
    for vinfo in videos:
        name = vinfo.video_id
        sp = StreamProcess(name=name, video_path=vinfo.video_path, video_info=vinfo)
        streams[name] = sp
        await _start_stream(sp)


async def health_loop() -> None:
    """Periodically check FFmpeg health and restart dead streams."""
    while not _shutdown_event.is_set():
        for name, sp in list(streams.items()):
            if not sp.is_alive and sp.process is not None:
                return_code = sp.process.returncode
                logger.warning(
                    "Stream '%s' exited (code %s), restarting",
                    name,
                    return_code,
                )
                asyncio.ensure_future(_restart_stream(sp))
        try:
            await asyncio.wait_for(_shutdown_event.wait(), timeout=config.HEALTH_CHECK_INTERVAL)
        except asyncio.TimeoutError:
            pass


async def shutdown_streams() -> None:
    """Graceful shutdown: stop all streams."""
    logger.info("Shutting down all streams\u2026")
    _shutdown_event.set()
    for name, sp in list(streams.items()):
        await _stop_stream(sp)
    logger.info("All streams stopped")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

router = fastapi.APIRouter(prefix="/streams", tags=["cctv"])


@router.get("")
async def list_streams() -> JSONResponse:
    """List all CCTV streams with metadata."""
    return JSONResponse({"streams": [sp.info() for sp in streams.values()]})


@router.post("/{name}/restart")
async def restart_stream(name: str) -> JSONResponse:
    """Restart a CCTV stream."""
    sp = streams.get(name)
    if sp is None:
        return JSONResponse({"error": f"Stream '{name}' not found"}, status_code=404)
    await _restart_stream(sp)
    return JSONResponse({"status": "restarted", "stream": sp.info()})


@router.post("/{name}/stop")
async def stop_stream(name: str) -> JSONResponse:
    """Stop a CCTV stream."""
    sp = streams.get(name)
    if sp is None:
        return JSONResponse({"error": f"Stream '{name}' not found"}, status_code=404)
    await _stop_stream(sp)
    return JSONResponse({"status": "stopped", "name": name})


@router.post("/{name}/start")
async def start_stream(name: str) -> JSONResponse:
    """Start a CCTV stream."""
    sp = streams.get(name)
    if sp is None:
        return JSONResponse({"error": f"Stream '{name}' not found"}, status_code=404)
    await _start_stream(sp)
    return JSONResponse({"status": "started", "stream": sp.info()})


# Legacy health endpoint (backward compat)
health_router = fastapi.APIRouter(tags=["cctv"])


@health_router.get("/cctv/health")
async def cctv_health() -> JSONResponse:
    """CCTV-only health check."""
    alive = sum(1 for sp in streams.values() if sp.is_alive)
    total = len(streams)
    return JSONResponse(
        {
            "status": "ok" if alive == total else "degraded",
            "streams": {"alive": alive, "total": total},
        }
    )
