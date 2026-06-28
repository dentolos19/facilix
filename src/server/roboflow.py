"""Roboflow workflow video processing via REST API.

Extracts frames from a video segment using OpenCV and sends each frame
to the Roboflow serverless workflow endpoint. Aggregates predictions
into a normalized detection format.

Each sampled frame produces a prediction output containing:
- beforeImage: the raw sampled frame (JPEG base64)
- afterImage: the frame with bounding boxes drawn (JPEG base64)
- predictions: the raw predictions from the workflow
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

# Colors for bounding boxes (BGR format for OpenCV)
_BOX_COLORS = [
    (0, 255, 0),  # green
    (255, 0, 0),  # blue
    (0, 0, 255),  # red
    (255, 255, 0),  # cyan
    (0, 255, 255),  # yellow
    (255, 0, 255),  # magenta
]


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
    Returns detections, prediction outputs with before/after images, and video metadata.
    """
    api_key = roboflow_api_key or ROBOFLOW_API_KEY
    api_base = (roboflow_api_base or ROBOFLOW_API_BASE).rstrip("/")

    if not api_key:
        raise ValueError("ROBOFLOW_API_KEY is not configured")
    if frame_interval < 1:
        raise ValueError("frame_interval must be at least 1")
    if not 0 <= min_confidence <= 1:
        raise ValueError("min_confidence must be between 0 and 1")

    output_names = set(data_output_names or [input_name, "predictions", "count"])
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
        prediction_outputs: list[dict[str, Any]] = []
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
                            detections.extend(output["predictions"])
                            prediction_outputs.append(output)
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
                        detections.extend(output["predictions"])
                        prediction_outputs.append(output)
                    else:
                        failed_frames += 1
            finally:
                cap.release()

        if frame_idx == 0:
            raise ValueError("Video contains no decodable frames")
        if attempted_frames > 0 and failed_frames == attempted_frames:
            raise RuntimeError(f"Roboflow inference failed for all {attempted_frames} sampled frames")

        log.info(
            "processed %d frames, %d detections, %d prediction outputs (%d inference failures)",
            frame_idx,
            len(detections),
            len(prediction_outputs),
            failed_frames,
        )

        return {
            "detections": detections,
            "count": len(detections),
            "predictionOutputs": prediction_outputs,
            "video": {
                "fps": round(fps, 2),
                "frameCount": frame_idx,
                "frameInterval": frame_interval,
                "sampledFrameCount": len(prediction_outputs),
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
    """Send a single frame to the Roboflow workflow and return a prediction output dict.

    Returns None if the request fails. The dict contains:
    - frameIndex, atSec: frame timing
    - beforeImage: raw sampled frame as JPEG base64
    - afterImage: frame with bounding boxes drawn as JPEG base64
    - predictions: normalized predictions for this frame
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

        # Draw bounding boxes on a copy of the frame
        annotated = _draw_annotations(frame.copy(), frame_data["predictions"])
        _, after_buf = cv2.imencode(".jpg", annotated)
        after_b64 = base64.b64encode(after_buf).decode("utf-8")

        return {
            "frameIndex": frame_index,
            "atSec": round(at_sec, 3),
            "beforeImage": before_b64,
            "afterImage": after_b64,
            "predictions": frame_data["predictions"],
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

    Returns an output even if no valid predictions are found so sampled frames
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

    raw_predictions: list[dict[str, Any]] = []
    image_meta: dict[str, int] | None = None

    for output in outputs:
        if not isinstance(output, dict):
            continue

        for name, value in output.items():
            if name == "count" or name not in output_names:
                continue

            # Capture prediction image metadata (dimensions the predictions are relative to)
            if image_meta is None and isinstance(value, dict) and isinstance(value.get("image"), dict):
                img = value["image"]
                if isinstance(img.get("width"), (int, float)) and isinstance(img.get("height"), (int, float)):
                    image_meta = {"width": int(img["width"]), "height": int(img["height"])}

            raw_predictions.extend(_extract_predictions(value))

    if image_meta is None:
        image_meta = default_image_meta

    predictions: list[dict[str, Any]] = []
    for pred in raw_predictions:
        detection = _to_detection(pred, frame_index, at_sec, image_meta)
        if (
            detection
            and detection["confidence"] >= min_confidence
            and (not allowed_labels or detection["label"] in allowed_labels)
        ):
            predictions.append(detection)

    return {"predictions": predictions, "image": image_meta}


def _draw_annotations(frame: np.ndarray, predictions: list[dict[str, Any]]) -> np.ndarray:
    """Draw bounding boxes and labels on a frame copy.

    Uses the normalized `box` field (xmin, ymin, xmax, ymax) for each prediction.
    Falls back to center-based geometry (x, y, width, height) if box is missing.
    """
    for i, pred in enumerate(predictions):
        color = _BOX_COLORS[i % len(_BOX_COLORS)]
        label = pred.get("label", "unknown")
        confidence = pred.get("confidence", 0)

        # Get bounding box coordinates
        box = pred.get("box")
        if box and all(k in box for k in ("xmin", "ymin", "xmax", "ymax")):
            xmin = int(box["xmin"])
            ymin = int(box["ymin"])
            xmax = int(box["xmax"])
            ymax = int(box["ymax"])
        else:
            p = pred.get("prediction")
            if not isinstance(p, dict):
                continue
            x = p.get("x")
            y = p.get("y")
            w = p.get("width")
            h = p.get("height")
            if all(isinstance(v, (int, float)) for v in [x, y, w, h]):
                xmin = int(x - w / 2)
                ymin = int(y - h / 2)
                xmax = int(x + w / 2)
                ymax = int(y + h / 2)
            else:
                continue

        frame_height, frame_width = frame.shape[:2]
        xmin = max(0, min(frame_width - 1, xmin))
        ymin = max(0, min(frame_height - 1, ymin))
        xmax = max(0, min(frame_width - 1, xmax))
        ymax = max(0, min(frame_height - 1, ymax))
        if xmax <= xmin or ymax <= ymin:
            continue

        cv2.rectangle(frame, (xmin, ymin), (xmax, ymax), color, 2)

        # Draw label background and text
        text = f"{label} {confidence:.2f}"
        (text_w, text_h), baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        label_bottom = ymin if ymin >= text_h + baseline + 4 else min(frame_height - 1, ymin + text_h + baseline + 4)
        label_top = max(0, label_bottom - text_h - baseline - 4)
        label_right = min(frame_width - 1, xmin + text_w + 4)
        cv2.rectangle(frame, (xmin, label_top), (label_right, label_bottom), color, -1)
        text_y = max(text_h, label_bottom - baseline - 2)
        cv2.putText(frame, text, (xmin + 2, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

    return frame


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
