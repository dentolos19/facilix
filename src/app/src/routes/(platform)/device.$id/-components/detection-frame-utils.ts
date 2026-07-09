import type { RecordingDetection } from "#/lib/functions/recordings";

export function getDetectionRect(detection: RecordingDetection) {
  const box = detection.box;
  if (
    box &&
    [box.xmin, box.ymin, box.xmax, box.ymax].every(Number.isFinite) &&
    box.xmax > box.xmin &&
    box.ymax > box.ymin
  ) {
    return {
      x: box.xmin,
      y: box.ymin,
      width: box.xmax - box.xmin,
      height: box.ymax - box.ymin,
    };
  }

  const prediction = detection.prediction;
  if (
    prediction &&
    [prediction.x, prediction.y, prediction.width, prediction.height].every(Number.isFinite) &&
    prediction.width > 0 &&
    prediction.height > 0
  ) {
    return {
      x: prediction.x - prediction.width / 2,
      y: prediction.y - prediction.height / 2,
      width: prediction.width,
      height: prediction.height,
    };
  }

  return null;
}
