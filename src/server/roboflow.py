"""Roboflow workflow video processing via REST API.

Extracts frames from a video segment using OpenCV and sends each frame
to the Roboflow serverless workflow endpoint. Aggregates detections
into a normalized detection format.

Each sampled frame produces a detection output containing:
- beforeImage: the raw sampled frame (JPEG base64)
- detections: the raw detections from the workflow
- image: the inference image dimensions
"""

from __future__ import annotations

import base64
import logging
import math
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
    class_filter: list[str] | None = None,
    frame_interval: int = 30,
    min_confidence: float = 0.4,
    roboflow_api_key: str | None = None,
    roboflow_api_base: str | None = None,
) -> dict[str, Any]:
    """Process a video segment through a Roboflow workflow.

    Extracts frames at regular intervals and sends each to the workflow endpoint.
    Returns detections, detection outputs with frame images, and video metadata.
    """
    api_key = roboflow_api_key or ROBOFLOW_API_KEY
    api_base = (roboflow_api_base or ROBOFLOW_API_BASE).rstrip("/")

    if not api_key:
        raise ValueError("ROBOFLOW_API_KEY is not configured")
    if frame_interval < 1:
        raise ValueError("frame_interval must be at least 1")
    if not 0 <= min_confidence <= 1:
        raise ValueError("min_confidence must be between 0 and 1")

    output_names = set(data_output_names or [input_name, "detections", "predictions", "count"])
    output_names.update({"detections", "predictions"})
    allowed_labels = {label.lower() for label in class_filter or []}

    # Write video to a temporary file for OpenCV
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name

    try:
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            raise ValueError("Failed to open video file")

        reported_fps = cap.get(cv2.CAP_PROP_FPS)
        fps = reported_fps if math.isfinite(reported_fps) and reported_fps > 0 else 30.0
        reported_frame_count = max(0, int(cap.get(cv2.CAP_PROP_FRAME_COUNT)))
        log.info(
            "processing video: reported %d frames @ %.1f fps, extracting every %d frames",
            reported_frame_count,
            fps,
            frame_interval,
        )

        detections: list[dict[str, Any]] = []
        detection_outputs: list[dict[str, Any]] = []
        frame_idx = 0
        attempted_frames = 0
        failed_frames = 0
        last_frame: np.ndarray | None = None
        last_frame_index = -1

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                while True:
                    ret, frame = cap.read()
                    if not ret:
                        break

                    last_frame = frame
                    last_frame_index = frame_idx

                    if frame_idx % frame_interval == 0:
                        attempted_frames += 1
                        output = await _process_frame(
                            client=client,
                            frame=frame,
                            workspace_name=workspace_name,
                            workflow_id=workflow_id,
                            input_name=input_name,
                            output_names=output_names,
                            frame_index=frame_idx,
                            at_sec=frame_idx / fps,
                            min_confidence=min_confidence,
                            allowed_labels=allowed_labels,
                            api_key=api_key,
                            api_base=api_base,
                        )
                        if output:
                            detections.extend(output["detections"])
                            detection_outputs.append(output)
                        else:
                            failed_frames += 1

                    frame_idx += 1

                # OpenCV's reported frame count can be missing or inaccurate.
                # Use the last frame we actually decoded instead of seeking by metadata.
                if last_frame is not None and last_frame_index % frame_interval != 0:
                    attempted_frames += 1
                    output = await _process_frame(
                        client=client,
                        frame=last_frame,
                        workspace_name=workspace_name,
                        workflow_id=workflow_id,
                        input_name=input_name,
                        output_names=output_names,
                        frame_index=last_frame_index,
                        at_sec=last_frame_index / fps,
                        min_confidence=min_confidence,
                        allowed_labels=allowed_labels,
                        api_key=api_key,
                        api_base=api_base,
                    )
                    if output:
                        detections.extend(output["detections"])
                        detection_outputs.append(output)
                    else:
                        failed_frames += 1
            finally:
                cap.release()

        if frame_idx == 0:
            raise ValueError("Video contains no decodable frames")
        if attempted_frames > 0 and failed_frames == attempted_frames:
            raise RuntimeError(f"Roboflow inference failed for all {attempted_frames} sampled frames")

        log.info(
            "processed %d frames, %d detections, %d detection outputs (%d inference failures)",
            frame_idx,
            len(detections),
            len(detection_outputs),
            failed_frames,
        )

        return {
            "detections": detections,
            "count": len(detections),
            "detectionOutputs": detection_outputs,
            "video": {
                "fps": round(fps, 2),
                "frameCount": frame_idx,
                "frameInterval": frame_interval,
                "sampledFrameCount": len(detection_outputs),
                "failedFrameCount": failed_frames,
            },
        }

    finally:
        os.unlink(tmp_path)


async def _process_frame(
    client: httpx.AsyncClient,
    frame: np.ndarray,
    workspace_name: str,
    workflow_id: str,
    input_name: str,
    output_names: set[str],
    frame_index: int,
    at_sec: float,
    min_confidence: float,
    allowed_labels: set[str],
    api_key: str,
    api_base: str,
) -> dict[str, Any] | None:
    """Send a single frame to the Roboflow workflow and return a detection output dict.

    Returns None if the request fails. The dict contains:
    - frameIndex, atSec: frame timing
    - beforeImage: raw sampled frame as JPEG base64
    - detections: normalized detections for this frame
    - image: inference image dimensions
    """
    # Encode frame as JPEG (before image)
    _, before_buf = cv2.imencode(".jpg", frame)
    before_b64 = base64.b64encode(before_buf).decode("utf-8")

    url = f"{api_base}/{workspace_name}/workflows/{workflow_id}"

    try:
        resp = await client.post(
            url,
            json={
                "api_key": api_key,
                "inputs": {
                    input_name: {"type": "base64", "value": before_b64},
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
            return None

        result = resp.json()
        frame_data = _parse_frame_response(
            result,
            output_names,
            frame_index,
            at_sec,
            min_confidence,
            allowed_labels,
            {"width": int(frame.shape[1]), "height": int(frame.shape[0])},
        )

        return {
            "frameIndex": frame_index,
            "atSec": round(at_sec, 3),
            "beforeImage": before_b64,
            "detections": frame_data["detections"],
            "image": frame_data["image"],
        }

    except Exception as exc:
        log.exception("roboflow frame %d error: %s", frame_index, exc)
        return None


def _parse_frame_response(
    result: Any,
    output_names: set[str],
    frame_index: int,
    at_sec: float,
    min_confidence: float,
    allowed_labels: set[str],
    default_image_meta: dict[str, int],
) -> dict[str, Any]:
    """Parse the Roboflow REST API response into detections + image metadata.

    Returns an output even if no valid detections are found so sampled frames
    can still be persisted for debugging/review.
    """
    # Roboflow Workflows commonly returns a top-level list. Direct model
    # responses and some workflow versions return an object instead.
    if isinstance(result, list):
        outputs = result
    elif isinstance(result, dict):
        outputs = result.get("outputs") or result.get("output") or [result]
    else:
        outputs = []
    if not isinstance(outputs, list):
        outputs = [outputs]

    raw_detections: list[dict[str, Any]] = []
    image_meta: dict[str, int] | None = None

    for output in outputs:
        if not isinstance(output, dict):
            continue

        for name, value in output.items():
            if name == "count" or name not in output_names:
                continue

            # Capture prediction image metadata (dimensions the detections are relative to)
            if image_meta is None and isinstance(value, dict) and isinstance(value.get("image"), dict):
                img = value["image"]
                if isinstance(img.get("width"), (int, float)) and isinstance(img.get("height"), (int, float)):
                    image_meta = {"width": int(img["width"]), "height": int(img["height"])}

            raw_detections.extend(_extract_detections(value))

    if image_meta is None:
        image_meta = default_image_meta

    detections: list[dict[str, Any]] = []
    for pred in raw_detections:
        detection = _to_detection(pred, frame_index, at_sec, image_meta)
        if (
            detection
            and detection["confidence"] >= min_confidence
            and (not allowed_labels or detection["label"] in allowed_labels)
        ):
            detections.append(detection)

    return {"detections": detections, "image": image_meta}


def _extract_detections(value: Any) -> list[dict[str, Any]]:
    """Recursively extract detections from various response formats."""
    if isinstance(value, list):
        return [p for p in value if isinstance(p, dict)]

    if not isinstance(value, dict):
        return []

    # Try common nested keys
    for key in ("value", "detections", "predictions"):
        nested = value.get(key)
        if isinstance(nested, list):
            return [p for p in nested if isinstance(p, dict)]
        if isinstance(nested, dict):
            return _extract_detections(nested)

    return []


def _to_detection(
    pred: dict[str, Any],
    frame_index: int,
    at_sec: float,
    image_meta: dict[str, int] | None = None,
) -> dict[str, Any] | None:
    """Normalize a Roboflow prediction into our detection format.

    Returns both normalized bounding boxes and raw prediction geometry
    so the frontend can render boxes and use source-image dimensions.
    """
    confidence = pred.get("confidence")
    if not isinstance(confidence, (int, float)):
        return None

    label = str(pred.get("class", "unknown")).lower()

    # Convert center-based bbox to corner-based
    x = pred.get("x")
    y = pred.get("y")
    width = pred.get("width")
    height = pred.get("height")
    has_geometry = all(isinstance(v, (int, float)) for v in [x, y, width, height])

    box = None
    if has_geometry:
        box = {
            "xmin": x - width / 2,
            "ymin": y - height / 2,
            "xmax": x + width / 2,
            "ymax": y + height / 2,
        }

    detection = {
        "label": label,
        "confidence": float(confidence),
        "box": box,
        "atSec": at_sec,
        "frameIndex": frame_index,
        "trackId": pred.get("tracker_id") or pred.get("track_id"),
        "classId": pred.get("class_id"),
        # Raw prediction geometry so frontend can render with source-image coordinates
        "prediction": {
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "detectionId": pred.get("detection_id"),
        }
        if has_geometry
        else None,
    }

    if image_meta:
        detection["image"] = image_meta

    return detection
