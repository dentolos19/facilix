import type { CSSProperties } from "react";

export interface DetectionBox {
  label: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EvidenceImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  detections: DetectionBox[];
  className?: string;
  imageClassName?: string;
  style?: CSSProperties;
  onError?: () => void;
  onImageLoad?: (size: { width: number; height: number }) => void;
}

export function EvidenceImage({
  src,
  alt,
  width,
  height,
  detections,
  className,
  imageClassName = "size-full object-contain",
  style,
  onError,
  onImageLoad,
}: EvidenceImageProps) {
  const strokeWidth = Math.max(2, Math.max(width, height) * 0.003);

  return (
    <div className={`relative ${className ?? "size-full"}`} style={style}>
      <img
        alt={alt}
        className={imageClassName}
        loading="lazy"
        onError={onError}
        onLoad={(event) => {
          const image = event.currentTarget;
          onImageLoad?.({ width: image.naturalWidth, height: image.naturalHeight });
        }}
        src={src}
      />
      {width > 0 && height > 0 && detections.length > 0 && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
          preserveAspectRatio="xMidYMid meet"
          viewBox={`0 0 ${width} ${height}`}
        >
          {detections.map((detection, index) => {
            const labelY = Math.max(12, detection.y - 5);
            const fontSize = Math.max(12, height * 0.025);
            return (
              <g key={`${detection.label}-${index}`}>
                <rect
                  fill="transparent"
                  height={detection.height}
                  stroke="#84cc16"
                  strokeWidth={strokeWidth}
                  width={detection.width}
                  x={detection.x}
                  y={detection.y}
                />
                <text
                  fill="#84cc16"
                  fontFamily="monospace"
                  fontSize={fontSize}
                  fontWeight="700"
                  paintOrder="stroke"
                  stroke="rgba(0,0,0,0.8)"
                  strokeWidth={strokeWidth}
                  x={detection.x}
                  y={labelY}
                >
                  {detection.label} {Math.round(detection.confidence * 100)}%
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
