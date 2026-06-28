import type { RecordingDetection } from "#/lib/functions/recordings";

export interface Size {
  width: number;
  height: number;
}

export interface DisplayRect extends Size {
  left: number;
  top: number;
}

export interface DetectionVideoTiming {
  fps: number;
  frameInterval: number;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function getDetectionWindowSec(video?: DetectionVideoTiming): number {
  if (!video || !isPositiveFinite(video.fps) || !isPositiveFinite(video.frameInterval)) {
    return 1;
  }
  return Math.max(video.frameInterval / video.fps, 0.15);
}

export function getActiveDetections(
  detections: RecordingDetection[],
  segmentTimeSec: number,
  video?: DetectionVideoTiming,
): RecordingDetection[] {
  if (!Number.isFinite(segmentTimeSec) || segmentTimeSec < 0) return [];
  const windowSec = getDetectionWindowSec(video);
  return detections.filter(
    (d) =>
      typeof d.atSec === "number" &&
      Number.isFinite(d.atSec) &&
      segmentTimeSec >= d.atSec &&
      segmentTimeSec < d.atSec + windowSec,
  );
}

export function calculateObjectContainRect(container: Size, video: Size): DisplayRect | null {
  if (
    !isPositiveFinite(container.width) ||
    !isPositiveFinite(container.height) ||
    !isPositiveFinite(video.width) ||
    !isPositiveFinite(video.height)
  ) {
    return null;
  }

  const videoAspect = video.width / video.height;
  const containerAspect = container.width / container.height;

  if (videoAspect > containerAspect) {
    const height = container.width / videoAspect;
    return {
      left: 0,
      top: (container.height - height) / 2,
      width: container.width,
      height,
    };
  }

  const width = container.height * videoAspect;
  return {
    left: (container.width - width) / 2,
    top: 0,
    width,
    height: container.height,
  };
}

export function getDetectionBox(detection: RecordingDetection): RecordingDetection["box"] | null {
  const box = detection.box;
  if (
    box &&
    [box.xmin, box.ymin, box.xmax, box.ymax].every(Number.isFinite) &&
    box.xmax > box.xmin &&
    box.ymax > box.ymin
  ) {
    return box;
  }

  const prediction = detection.prediction;
  if (
    prediction &&
    [prediction.x, prediction.y, prediction.width, prediction.height].every(Number.isFinite) &&
    prediction.width > 0 &&
    prediction.height > 0
  ) {
    return {
      xmin: prediction.x - prediction.width / 2,
      ymin: prediction.y - prediction.height / 2,
      xmax: prediction.x + prediction.width / 2,
      ymax: prediction.y + prediction.height / 2,
    };
  }

  return null;
}

export function projectDetectionBox(
  detection: RecordingDetection,
  displayRect: DisplayRect,
  fallbackSource: Size,
): DisplayRect | null {
  const box = getDetectionBox(detection);
  if (!box) return null;

  const source =
    detection.image && isPositiveFinite(detection.image.width) && isPositiveFinite(detection.image.height)
      ? detection.image
      : fallbackSource;
  if (!isPositiveFinite(source.width) || !isPositiveFinite(source.height)) return null;

  const rawLeft = displayRect.left + (box.xmin / source.width) * displayRect.width;
  const rawTop = displayRect.top + (box.ymin / source.height) * displayRect.height;
  const rawRight = displayRect.left + (box.xmax / source.width) * displayRect.width;
  const rawBottom = displayRect.top + (box.ymax / source.height) * displayRect.height;

  const left = Math.max(displayRect.left, Math.min(displayRect.left + displayRect.width, rawLeft));
  const top = Math.max(displayRect.top, Math.min(displayRect.top + displayRect.height, rawTop));
  const right = Math.max(displayRect.left, Math.min(displayRect.left + displayRect.width, rawRight));
  const bottom = Math.max(displayRect.top, Math.min(displayRect.top + displayRect.height, rawBottom));

  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}
