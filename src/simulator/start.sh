#!/bin/sh
set -e

MEDIAMTX_CONFIG="${MEDIAMTX_CONFIG:-/app/mediamtx.yml}"
MEDIAMTX_PID=""
APP_PID=""

cleanup() {
    echo "[start] Shutting down..."
    if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
        echo "[start] Stopping FastAPI..."
        kill -TERM "$APP_PID" 2>/dev/null || true
        wait "$APP_PID" 2>/dev/null || true
    fi
    if [ -n "$MEDIAMTX_PID" ] && kill -0 "$MEDIAMTX_PID" 2>/dev/null; then
        echo "[start] Stopping MediaMTX..."
        kill -TERM "$MEDIAMTX_PID" 2>/dev/null || true
        wait "$MEDIAMTX_PID" 2>/dev/null || true
    fi
    echo "[start] Shutdown complete"
}

trap cleanup EXIT INT TERM

echo "[start] Starting MediaMTX..."
/usr/local/bin/mediamtx "$MEDIAMTX_CONFIG" &
MEDIAMTX_PID=$!

echo "[start] Waiting for MediaMTX API..."
MEDIAMTX_READY=0
for _ in $(seq 1 30); do
  if curl -sf http://localhost:9997/v3/config/global/get > /dev/null 2>&1; then
    echo "[start] MediaMTX ready"
    MEDIAMTX_READY=1
    break
  fi
  sleep 1
done

if [ "$MEDIAMTX_READY" -ne 1 ]; then
  echo "[start] MediaMTX failed to become ready" >&2
  exit 1
fi

echo "[start] Starting FastAPI..."
/app/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 &
APP_PID=$!

wait "$APP_PID"
