#!/bin/sh
set -e

MEDIAMTX_CONFIG="${MEDIAMTX_CONFIG:-/app/mediamtx.yml}"

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
  kill "$MEDIAMTX_PID" 2>/dev/null || true
  exit 1
fi

echo "[start] Starting FastAPI..."
exec uv run uvicorn main:app --host 0.0.0.0 --port 8000
