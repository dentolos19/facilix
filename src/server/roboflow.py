"""Roboflow workflow video processing via REST API.

Extracts frames from a video segment using OpenCV and sends each frame
to the Roboflow serverless workflow endpoint. Aggregates predictions
into a normalized detection format.
"""

from __future__ import annotations

import base64
import logging
import os
import tempfile
from typing import Any

import cv2
import httpx
import numpy as np

log = logging.getLogger("facilix.roboflow")

ROBOFLOW_API_BASE = os.getenv("ROBOFLOW_API_BASE", "https://serverless.roboflow.com")
ROBOFLOW_API_KEY = os.getenv("ROBOFLOW_API_KEY", "")


async def process_video_workflow(
    video_bytes: bytes,
    workspace_name: str,
    workflow_id: str,
    input_name: str = "image",
    data_output_names: list[str] | None = None,
    frame_interval: int = 30,
    min_confidence: float = 0.4,
) -> list[dict[str, Any]]:
    """Process a video segment through a Roboflow workflow.

    Extracts frames at regular intervals and sends each to the workflow endpoint.
    Returns a list of normalized detections.
    """
    if not ROBOFLOW_API_KEY:
        raise ValueError("ROBOFLOW_API_KEY is not configured")

    output_names = set(data_output_names or [input_name, "predictions", "count"])

    # Write video to a temporary file for OpenCV
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name

    try:
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            raise ValueError("Failed to open video file")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        log.info(
            "processing video: %d frames @ %.1f fps, extracting every %d frames",
            frame_count,
            fps,
            frame_interval,
        )

        detections: list[dict[str, Any]] = []
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_interval == 0:
                frame_detections = await _process_frame(
                    frame=frame,
                    workspace_name=workspace_name,
                    workflow_id=workflow_id,
                    input_name=input_name,
                    output_names=output_names,
                    frame_index=frame_idx,
                    at_sec=frame_idx / fps,
                    min_confidence=min_confidence,
                )
                detections.extend(frame_detections)

            frame_idx += 1

        cap.release()
        log.info("processed %d frames, %d detections", frame_idx, len(detections))
        return detections

    finally:
        os.unlink(tmp_path)


async def _process_frame(
    frame: np.ndarray,
    workspace_name: str,
    workflow_id: str,
    input_name: str,
    output_names: set[str],
    frame_index: int,
    at_sec: float,
    min_confidence: float,
) -> list[dict[str, Any]]:
    """Send a single frame to the Roboflow workflow and return detections."""
    # Encode frame as JPEG
    _, buffer = cv2.imencode(".jpg", frame)
    b64 = base64.b64encode(buffer).decode("utf-8")

    url = f"{ROBOFLOW_API_BASE}/infer/workflows/{workspace_name}/{workflow_id}"

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                url,
                json={
                    "api_key": ROBOFLOW_API_KEY,
                    "inputs": {
                        input_name: {"type": "base64", "value": b64},
                    },
                },
            )

            if resp.status_code != 200:
                log.warning(
                    "roboflow frame %d failed: HTTP %d — %s",
                    frame_index,
                    resp.status_code,
                    resp.text[:200],
                )
                return []

            result = resp.json()
            return _parse_response(result, output_names, frame_index, at_sec, min_confidence)

        except Exception as exc:
            log.exception("roboflow frame %d error: %s", frame_index, exc)
            return []


def _parse_response(
    result: dict[str, Any],
    output_names: set[str],
    frame_index: int,
    at_sec: float,
    min_confidence: float,
) -> list[dict[str, Any]]:
    """Parse the Roboflow REST API response into normalized detections."""
    detections: list[dict[str, Any]] = []

    # Handle different response shapes
    outputs = result.get("outputs") or result.get("output") or [result]
    if not isinstance(outputs, list):
        outputs = [outputs]

    for output in outputs:
        if not isinstance(output, dict):
            continue

        for name, value in output.items():
            if name == "count" or name not in output_names:
                continue

            predictions = _extract_predictions(value)
            for pred in predictions:
                detection = _to_detection(pred, frame_index, at_sec)
                if detection and detection["confidence"] >= min_confidence:
                    detections.append(detection)

    return detections


def _extract_predictions(value: Any) -> list[dict[str, Any]]:
    """Recursively extract predictions from various response formats."""
    if isinstance(value, list):
        return [p for p in value if isinstance(p, dict)]

    if not isinstance(value, dict):
        return []

    # Try common nested keys
    for key in ("value", "predictions", "detections"):
        nested = value.get(key)
        if isinstance(nested, list):
            return [p for p in nested if isinstance(p, dict)]
        if isinstance(nested, dict):
            return _extract_predictions(nested)

    return []


def _to_detection(
    pred: dict[str, Any],
    frame_index: int,
    at_sec: float,
) -> dict[str, Any] | None:
    """Normalize a Roboflow prediction into our detection format."""
    confidence = pred.get("confidence")
    if not isinstance(confidence, (int, float)):
        return None

    label = str(pred.get("class", "unknown")).lower()

    # Convert center-based bbox to corner-based
    x = pred.get("x")
    y = pred.get("y")
    width = pred.get("width")
    height = pred.get("height")

    box = None
    if all(isinstance(v, (int, float)) for v in [x, y, width, height]):
        box = {
            "xmin": x - width / 2,
            "ymin": y - height / 2,
            "xmax": x + width / 2,
            "ymax": y + height / 2,
        }

    return {
        "label": label,
        "confidence": float(confidence),
        "box": box,
        "atSec": at_sec,
        "frameIndex": frame_index,
        "trackId": pred.get("tracker_id") or pred.get("track_id"),
        "classId": pred.get("class_id"),
    }
