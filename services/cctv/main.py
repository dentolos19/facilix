"""CCTV Simulator — loops local MP4 files and publishes them as RTSP/RTMP streams via MediaMTX."""

from __future__ import annotations

import asyncio
import logging
import os
import signal
from pathlib import Path
from typing import Dict, List, Optional

import fastapi
import uvicorn
from fastapi.responses import JSONResponse

import config

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("simulator")

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

StreamState = Dict[str, "StreamProcess"]


class StreamProcess:
    """Holds the subprocess and metadata for one camera stream."""

    def __init__(self, name: str, video_path: str) -> None:
        self.name = name
        self.video_path = video_path
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
        return {
            "name": self.name,
            "video_path": self.video_path,
            "alive": self.is_alive,
            "rtsp_url": self.rtsp_url,
            "rtmp_url": self.rtmp_url,
            "use_copy": self.use_copy,
        }


# ---------------------------------------------------------------------------
# Stream manager
# ---------------------------------------------------------------------------

streams: StreamState = {}
_shutdown_event = asyncio.Event()


def _discover_videos() -> List[Path]:
    """Return sorted list of .mp4 files in the videos directory."""
    video_dir = Path(config.VIDEOS_DIR)
    if not video_dir.is_dir():
        logger.warning("Videos directory %s does not exist", video_dir)
        return []
    files = sorted(video_dir.glob("*.mp4"))
    logger.info("Discovered %d video(s) in %s", len(files), video_dir)
    return files


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
        "Starting stream '%s' (copy=%s): %s", sp.name, sp.use_copy, " ".join(args)
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
                    "Stream '%s': codec copy failed, falling back to re-encode", sp.name
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


async def _initialize_streams() -> None:
    """Discover videos and start all streams."""
    videos = _discover_videos()
    for vpath in videos:
        name = vpath.stem  # filename without extension
        sp = StreamProcess(name=name, video_path=str(vpath))
        streams[name] = sp
        await _start_stream(sp)


async def _health_loop() -> None:
    """Periodically check FFmpeg health and restart dead streams."""
    while not _shutdown_event.is_set():
        for name, sp in list(streams.items()):
            if not sp.is_alive and sp.process is not None:
                # Process exited unexpectedly
                return_code = sp.process.returncode
                logger.warning(
                    "Stream '%s' exited (code %s), restarting", name, return_code
                )
                asyncio.ensure_future(_restart_stream(sp))
        try:
            await asyncio.wait_for(_shutdown_event.wait(), timeout=config.HEALTH_CHECK_INTERVAL)
        except asyncio.TimeoutError:
            pass


async def _shutdown() -> None:
    """Graceful shutdown: stop all streams."""
    logger.info("Shutting down all streams…")
    _shutdown_event.set()
    for name, sp in list(streams.items()):
        await _stop_stream(sp)
    logger.info("All streams stopped")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = fastapi.FastAPI(
    title="CCTV Simulator",
    description="Loops local MP4 files and publishes RTSP/RTMP streams via MediaMTX.",
    version="0.1.0",
)


@app.on_event("startup")
async def startup() -> None:
    await _initialize_streams()
    asyncio.ensure_future(_health_loop())


@app.on_event("shutdown")
async def shutdown() -> None:
    await _shutdown()


# -- Endpoints ---------------------------------------------------------------


@app.get("/health")
async def health() -> JSONResponse:
    alive = sum(1 for sp in streams.values() if sp.is_alive)
    total = len(streams)
    return JSONResponse(
        {
            "status": "ok" if alive == total else "degraded",
            "streams": {"alive": alive, "total": total},
        }
    )


@app.get("/streams")
async def list_streams() -> JSONResponse:
    return JSONResponse(
        {"streams": [sp.info() for sp in streams.values()]}
    )


@app.post("/streams/{name}/restart")
async def restart_stream(name: str) -> JSONResponse:
    sp = streams.get(name)
    if sp is None:
        return JSONResponse({"error": f"Stream '{name}' not found"}, status_code=404)
    await _restart_stream(sp)
    return JSONResponse({"status": "restarted", "stream": sp.info()})


@app.post("/streams/{name}/stop")
async def stop_stream(name: str) -> JSONResponse:
    sp = streams.get(name)
    if sp is None:
        return JSONResponse({"error": f"Stream '{name}' not found"}, status_code=404)
    await _stop_stream(sp)
    return JSONResponse({"status": "stopped", "name": name})


@app.post("/streams/{name}/start")
async def start_stream(name: str) -> JSONResponse:
    sp = streams.get(name)
    if sp is None:
        return JSONResponse({"error": f"Stream '{name}' not found"}, status_code=404)
    await _start_stream(sp)
    return JSONResponse({"status": "started", "stream": sp.info()})


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        log_level=config.LOG_LEVEL,
        reload=False,
    )
