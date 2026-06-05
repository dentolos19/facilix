import type { ObjectDetectorResult } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";

// ─── Props ───────────────────────────────────────────────────────────────────

interface ObjectDetectionOverlayProps {
  enabled: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

type DetectorStatus = "idle" | "loading" | "ready" | "error";

// ─── Color palette for bounding boxes (indexed by category index) ───────────

const BOX_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#98D8C8",
  "#F7DC6F",
  "#BB8FCE",
  "#85C1E9",
  "#F0B27A",
  "#82E0AA",
];

// ─── Component ───────────────────────────────────────────────────────────────

export function ObjectDetectionOverlay({ enabled, videoRef }: ObjectDetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [detectionCount, setDetectionCount] = useState(0);
  const [status, setStatus] = useState<DetectorStatus>("idle");

  // Store enabled in a ref so the animation loop can check it without
  // restarting the effect on every toggle.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setDetectionCount(0);
      clearCanvas(canvasRef.current);
      return;
    }

    let detector: Awaited<ReturnType<typeof createDetector>> | null = null;
    let active = true;
    let rafId: number | null = null;

    // ── Init ──────────────────────────────────────────────────────────────

    async function init() {
      if (!active) return;
      setStatus("loading");

      try {
        detector = await createDetector();
        if (!active) {
          detector.close();
          return;
        }
        setStatus("ready");
        startLoop();
      } catch {
        if (!active) return;
        setStatus("error");
      }
    }

    // ── Loop ───────────────────────────────────────────────────────────────

    function startLoop() {
      // Throttle to ~8 FPS
      let lastInference = 0;
      const minInterval = 125; // ms

      function onFrame(now: DOMHighResTimeStamp, _metadata?: unknown) {
        if (!active) return;

        const video = videoRef.current;
        if (!video) {
          // Video may be null temporarily; chain via RAF until available
          rafId = requestAnimationFrame(onFrame);
          return;
        }

        if (
          enabledRef.current &&
          detector &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        ) {
          const elapsed = now - lastInference;
          if (elapsed >= minInterval) {
            lastInference = now;
            runInference(video, detector);
          }
        }

        // Chain: prefer requestVideoFrameCallback, fall back to RAF
        if (typeof video.requestVideoFrameCallback === "function") {
          video.requestVideoFrameCallback(onFrame);
        } else {
          rafId = requestAnimationFrame(onFrame);
        }
      }

      // Start the chain via RAF to ensure video ref is available
      rafId = requestAnimationFrame(onFrame);
    }

    // ── Run one inference frame ───────────────────────────────────────────

    function runInference(video: HTMLVideoElement, det: NonNullable<typeof detector>) {
      try {
        const results = det.detectForVideo(video, performance.now()) as ObjectDetectorResult;
        setDetectionCount(results.detections.length);
        drawDetections(video, results, canvasRef.current);
      } catch {
        // Reading pixels from cross-origin HLS video can fail if the manifest
        // or any segment misses CORS headers. The local MediaMTX config already
        // uses hlsAllowOrigins: ["*"], but external streams must do the same.
        if (!active) return;
        active = false;
        setDetectionCount(0);
        setStatus("error");
        clearCanvas(canvasRef.current);
      }
    }

    // ── Teardown ──────────────────────────────────────────────────────────

    init();

    return () => {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (detector) detector.close();
      clearCanvas(canvasRef.current);
    };
  }, [enabled, videoRef]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <canvas className="pointer-events-none absolute inset-0 size-full z-10" ref={canvasRef} />

      {status === "loading" && (
        <div className="pointer-events-none absolute top-2 right-2 z-20 rounded bg-black/60 px-1.5 py-0.5">
          <span className="text-[9px] text-white/70">Loading detector…</span>
        </div>
      )}

      {status === "error" && (
        <div className="pointer-events-none absolute top-2 right-2 z-20 rounded bg-black/60 px-1.5 py-0.5">
          <span className="text-[9px] text-red-400">Detection unavailable — check HLS CORS/model access</span>
        </div>
      )}

      {status === "ready" && (
        <div className="pointer-events-none absolute top-2 right-2 z-20 rounded bg-black/60 px-1.5 py-0.5">
          <span className="text-[9px] text-white/70">{detectionCount} objects</span>
        </div>
      )}
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createDetector() {
  const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");

  const vision = await FilesetResolver.forVisionTasks(
    // Use the local wasm files from @mediapipe/tasks-vision package.
    // Vite resolves bare module paths in node_modules for dynamic imports.
    // For WASM files, we need to use the CDN alternate or provide a
    // Vite-compatible path that resolves to the package's wasm directory.
    // We delegate resolution to the package's default CDN path so that
    // the WASM loader can locate the .wasm and .js files it expects.
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
  );

  return ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite",
      delegate: "CPU",
    },
    scoreThreshold: 0.5,
    maxResults: 8,
    runningMode: "VIDEO",
  });
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawDetections(video: HTMLVideoElement, result: ObjectDetectorResult, canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw === 0 || vh === 0) return;

  // Fit the canvas drawing buffer to the element's displayed size
  const rect = canvas.getBoundingClientRect();
  const cw = rect.width;
  const ch = rect.height;
  if (cw === 0 || ch === 0) return;
  let bufferW = cw * (window.devicePixelRatio || 1);
  let bufferH = ch * (window.devicePixelRatio || 1);

  // Clamp to reasonable limits to avoid memory issues
  bufferW = Math.min(bufferW, 1920);
  bufferH = Math.min(bufferH, 1080);

  if (canvas.width !== bufferW || canvas.height !== bufferH) {
    canvas.width = bufferW;
    canvas.height = bufferH;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Compute the displayed video region (accounting for object-fit: contain)
  const videoAspect = vw / vh;
  const containerAspect = cw / ch;

  let displayW: number;
  let displayH: number;
  let offsetX = 0;
  let offsetY = 0;

  if (videoAspect > containerAspect) {
    // Video wider than container → letterbox top/bottom
    displayW = cw;
    displayH = cw / videoAspect;
    offsetY = (ch - displayH) / 2;
  } else {
    // Video taller than container → pillarbox left/right
    displayH = ch;
    displayW = ch * videoAspect;
    offsetX = (cw - displayW) / 2;
  }

  const scaleX = (bufferW / cw) * (displayW / vw);
  const scaleY = (bufferH / ch) * (displayH / vh);
  const originX = offsetX * (bufferW / cw);
  const originY = offsetY * (bufferH / ch);

  const detections = result.detections ?? [];

  for (let i = 0; i < detections.length; i++) {
    const detection = detections[i];
    const box = detection.boundingBox;
    if (!box) continue;

    const topCat = detection.categories[0];
    if (!topCat) continue;

    const x = originX + box.originX * scaleX;
    const y = originY + box.originY * scaleY;
    const w = box.width * scaleX;
    const h = box.height * scaleY;

    const color = BOX_COLORS[topCat.index % BOX_COLORS.length];

    // Draw bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, Math.round(bufferW / 400));
    ctx.strokeRect(x, y, w, h);

    // Draw label background
    const label = `${topCat.categoryName} ${(topCat.score * 100).toFixed(0)}%`;
    ctx.font = `${Math.max(10, Math.round(bufferW / 50))}px ui-monospace, monospace`;
    const textMetrics = ctx.measureText(label);
    const labelHeight = 18;
    const labelPadding = 4;

    ctx.fillStyle = color;
    ctx.fillRect(x, y - labelHeight, textMetrics.width + labelPadding * 2, labelHeight);

    // Draw label text
    ctx.fillStyle = "#000";
    ctx.fillText(label, x + labelPadding, y - labelHeight + labelHeight - 4);
  }
}
