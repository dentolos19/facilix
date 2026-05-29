"""Configuration for the CCTV simulator."""

import os

# Directory mounted from host containing MP4 video files
VIDEOS_DIR = os.environ.get("SIMULATOR_VIDEOS_DIR", "/videos")

# MediaMTX hostname (container name in compose)
MEDIAMTX_HOST = os.environ.get("MEDIAMTX_HOST", "mediamtx")

# RTSP target port inside MediaMTX
MEDIAMTX_RTSP_PORT = int(os.environ.get("MEDIAMTX_RTSP_PORT", "8554"))

# RTMP target port inside MediaMTX
MEDIAMTX_RTMP_PORT = int(os.environ.get("MEDIAMTX_RTMP_PORT", "1935"))

# How often to check whether FFmpeg processes are alive (seconds)
HEALTH_CHECK_INTERVAL = int(os.environ.get("SIMULATOR_HEALTH_CHECK_INTERVAL", "15"))

# Fallback encode args if stream copy fails
FALLBACK_ENCODE_ARGS = [
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency",
    "-c:a",
    "aac",
]

# Log level for the app
LOG_LEVEL = os.environ.get("SIMULATOR_LOG_LEVEL", "info")
