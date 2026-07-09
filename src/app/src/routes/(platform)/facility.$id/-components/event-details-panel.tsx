import { AlertTriangleIcon, ImageIcon, Maximize2Icon, VideoIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import { EvidenceImage, type DetectionBox } from "#/components/evidence-image";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { ScrollArea } from "#/components/ui/scroll-area";
import type { FacilityEventAttachmentRow, FacilityEventView } from "#/lib/functions/events";

import { EventSeverityBadge } from "./global-events-panel";

const VALUE_KEYS = [
  "sensorType",
  "value",
  "unit",
  "status",
  "count",
  "threshold",
  "operator",
  "thresholdMode",
  "confidence",
  "matchedLabels",
  "detectionCount",
  "alertCount",
  "durationSec",
] as const;

const RESERVED_KEYS = new Set([
  "source",
  "assetId",
  "segmentId",
  "pluginId",
  "pluginName",
  "category",
  "alertKind",
  "description",
  "reason",
  "recommendedAction",
  "evidence",
  ...VALUE_KEYS,
]);

export function EventDetailsPanel({ event }: { event: FacilityEventView }) {
  const primaryAttachment = event.attachments.find((item) => item.role === "primary") ?? event.attachments[0] ?? null;
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(primaryAttachment?.id ?? null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [failedAttachmentId, setFailedAttachmentId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedAttachmentId(primaryAttachment?.id ?? null);
    setZoomOpen(false);
    setZoom(1);
    setFailedAttachmentId(null);
  }, [event.id, primaryAttachment?.id]);

  const selectedAttachment = event.attachments.find((item) => item.id === selectedAttachmentId) ?? primaryAttachment;
  const attachmentContext = buildAttachmentContext(selectedAttachment, event);
  const values = useMemo(() => buildValueRows(event.data), [event.data]);
  const technicalData = useMemo(
    () => Object.fromEntries(Object.entries(event.data).filter(([key]) => !RESERVED_KEYS.has(key))),
    [event.data],
  );
  const description = asText(event.data.description) ?? event.message;
  const reason = asText(event.data.reason);
  const recommendedAction = asText(event.data.recommendedAction);

  return (
    <>
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-muted-foreground/50 font-mono text-[9px] tracking-wider uppercase">Event details</p>
              <h3 className="text-foreground mt-0.5 text-sm leading-snug font-medium">{event.message}</h3>
            </div>
            <EventSeverityBadge severity={event.severity} />
          </div>

          <EventAttachmentViewer
            attachments={event.attachments}
            failedAttachmentId={failedAttachmentId}
            onAttachmentError={setFailedAttachmentId}
            onOpenZoom={() => {
              setZoom(1);
              setZoomOpen(true);
            }}
            onSelectAttachment={setSelectedAttachmentId}
            selectedAttachment={selectedAttachment}
          />

          {attachmentContext && (
            <section className="border border-sky-500/25 bg-sky-500/5 p-3">
              <p className="font-mono text-[9px] tracking-wider text-sky-700 uppercase dark:text-sky-400">
                What to look for
              </p>
              <p className="text-foreground/80 mt-1 text-[11px] leading-relaxed">{attachmentContext}</p>
            </section>
          )}

          <section className="border-border bg-muted/20 border p-3">
            <p className="text-muted-foreground/50 font-mono text-[9px] tracking-wider uppercase">What happened</p>
            <p className="text-foreground/80 mt-1 text-[11px] leading-relaxed">{description}</p>
            {reason && (
              <div className="border-border/60 mt-2 border-t pt-2">
                <p className="text-muted-foreground/50 text-[10px]">Reason</p>
                <p className="text-foreground/75 mt-0.5 text-[11px] leading-relaxed">{reason}</p>
              </div>
            )}
          </section>

          <section className="border-border border">
            <DetailRow label="Device" value={event.deviceName} />
            {event.zoneName && <DetailRow label="Zone" value={event.zoneName} />}
            <DetailRow label="Event type" monospace value={event.type} />
            <DetailRow label="Recorded" value={new Date(event.createdAt).toLocaleString()} />
            {asText(event.data.pluginName) && <DetailRow label="Intelligence" value={asText(event.data.pluginName)!} />}
            {asText(event.data.alertKind) && <DetailRow label="Rule" value={humanize(asText(event.data.alertKind)!)} />}
            {values.map((row) => (
              <DetailRow key={row.label} label={row.label} value={row.value} />
            ))}
          </section>

          {recommendedAction && (
            <section className="border border-amber-500/25 bg-amber-500/5 p-3">
              <p className="font-mono text-[9px] tracking-wider text-amber-700 uppercase dark:text-amber-400">
                Recommended response
              </p>
              <p className="text-foreground/80 mt-1 text-[11px] leading-relaxed">{recommendedAction}</p>
            </section>
          )}

          {Object.keys(technicalData).length > 0 && (
            <details className="border-border text-muted-foreground border p-2 text-[10px]">
              <summary className="cursor-pointer font-medium">Technical metadata</summary>
              <pre className="mt-2 overflow-x-auto font-mono text-[9px] break-all whitespace-pre-wrap">
                {JSON.stringify(technicalData, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </ScrollArea>

      <Dialog onOpenChange={setZoomOpen} open={zoomOpen}>
        <DialogContent className="flex h-[90vh] max-w-[95vw] flex-col gap-3 sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Evidence image</DialogTitle>
          </DialogHeader>
          <div className="border-border flex min-h-0 flex-1 items-center justify-center overflow-auto border bg-black/95">
            {selectedAttachment?.kind === "image" && (
              <EventEvidenceImage
                alt={`Evidence from ${event.deviceName}`}
                attachment={selectedAttachment}
                className="transition-transform"
                imageClassName="block max-h-none max-w-none"
                onError={() => setFailedAttachmentId(selectedAttachment.id)}
                style={{ transform: `scale(${zoom})` }}
              />
            )}
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button
              aria-label="Zoom out"
              disabled={zoom <= 1}
              onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
              size="icon-sm"
              variant="outline"
            >
              <ZoomOutIcon className="size-3.5" />
            </Button>
            <span className="text-muted-foreground w-14 text-center font-mono text-[10px]">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              aria-label="Zoom in"
              disabled={zoom >= 3}
              onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
              size="icon-sm"
              variant="outline"
            >
              <ZoomInIcon className="size-3.5" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EventAttachmentViewer({
  attachments,
  selectedAttachment,
  failedAttachmentId,
  onSelectAttachment,
  onOpenZoom,
  onAttachmentError,
}: {
  attachments: FacilityEventAttachmentRow[];
  selectedAttachment: FacilityEventAttachmentRow | null;
  failedAttachmentId: string | null;
  onSelectAttachment: (id: string) => void;
  onOpenZoom: () => void;
  onAttachmentError: (id: string) => void;
}) {
  if (attachments.length === 0) {
    return (
      <div className="border-border bg-muted/10 text-muted-foreground/60 flex min-h-28 flex-col items-center justify-center gap-2 border border-dashed p-4 text-center">
        <ImageIcon className="size-5 opacity-50" />
        <p className="text-[10px]">No evidence attachments were captured for this event.</p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="border-border relative aspect-video overflow-hidden border bg-black/90">
        {selectedAttachment?.id === failedAttachmentId ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center">
            <AlertTriangleIcon className="size-5" />
            <p className="text-[10px]">This evidence file is no longer available.</p>
          </div>
        ) : selectedAttachment?.kind === "video" ? (
          <video
            className="h-full w-full object-contain"
            controls
            onError={() => onAttachmentError(selectedAttachment.id)}
            playsInline
            preload="metadata"
            src={selectedAttachment.url}
          />
        ) : selectedAttachment ? (
          <>
            <EventEvidenceImage
              alt="Annotated event evidence"
              attachment={selectedAttachment}
              className="h-full w-full"
              imageClassName="h-full w-full object-contain"
              onError={() => onAttachmentError(selectedAttachment.id)}
            />
            <Button
              aria-label="Open image zoom"
              className="absolute top-2 right-2 bg-black/60 text-white hover:bg-black/80"
              onClick={onOpenZoom}
              size="icon-sm"
              variant="ghost"
            >
              <Maximize2Icon className="size-3.5" />
            </Button>
          </>
        ) : null}
      </div>

      {attachments.length > 1 && (
        <div className="grid grid-cols-4 gap-1.5">
          {attachments.map((item) => (
            <button
              aria-label={`View ${item.kind} attachment`}
              className={`border-border bg-muted/20 flex aspect-video items-center justify-center overflow-hidden border transition-colors ${
                selectedAttachment?.id === item.id ? "ring-ring ring-1" : "hover:bg-muted/40"
              }`}
              key={item.id}
              onClick={() => onSelectAttachment(item.id)}
              type="button"
            >
              {item.kind === "video" ? (
                <VideoIcon className="text-muted-foreground size-4" />
              ) : (
                <img alt="" className="h-full w-full object-cover" loading="lazy" src={item.url} />
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function EventEvidenceImage({
  attachment,
  alt,
  className,
  imageClassName,
  style,
  onError,
}: {
  attachment: FacilityEventAttachmentRow;
  alt: string;
  className?: string;
  imageClassName?: string;
  style?: CSSProperties;
  onError?: () => void;
}) {
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const detections = useMemo((): DetectionBox[] => {
    const rawDetections = Array.isArray(attachment.metadata.detections)
      ? attachment.metadata.detections
      : Array.isArray(attachment.metadata.predictions)
        ? attachment.metadata.predictions
        : [];

    return rawDetections.flatMap((item) => {
      if (!isRecord(item)) return [];
      const box = getDetectionBox(item);
      if (!box) return [];
      const confidence = typeof item.confidence === "number" && Number.isFinite(item.confidence) ? item.confidence : 0;
      return [{ label: typeof item.label === "string" ? item.label : "detection", confidence, ...box }];
    });
  }, [attachment.metadata]);

  return (
    <EvidenceImage
      alt={alt}
      className={className}
      detections={detections}
      height={imageSize?.height ?? 0}
      imageClassName={imageClassName}
      onError={onError}
      onImageLoad={setImageSize}
      src={attachment.url}
      style={style}
      width={imageSize?.width ?? 0}
    />
  );
}

function getDetectionBox(item: Record<string, unknown>) {
  if (isRecord(item.box)) {
    const xmin = toFiniteNumber(item.box.xmin);
    const ymin = toFiniteNumber(item.box.ymin);
    const xmax = toFiniteNumber(item.box.xmax);
    const ymax = toFiniteNumber(item.box.ymax);
    if (xmin !== null && ymin !== null && xmax !== null && ymax !== null && xmax > xmin && ymax > ymin) {
      return { x: xmin, y: ymin, width: xmax - xmin, height: ymax - ymin };
    }
  }

  const prediction = isRecord(item.prediction) ? item.prediction : isRecord(item.detection) ? item.detection : null;
  if (!prediction) return null;

  const x = toFiniteNumber(prediction.x);
  const y = toFiniteNumber(prediction.y);
  const width = toFiniteNumber(prediction.width);
  const height = toFiniteNumber(prediction.height);
  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) return null;

  return { x: x - width / 2, y: y - height / 2, width, height };
}

function buildAttachmentContext(
  attachment: FacilityEventAttachmentRow | null,
  event: FacilityEventView,
): string | null {
  const metadata = attachment?.metadata ?? {};
  const rawDetections = Array.isArray(metadata.detections)
    ? metadata.detections
    : Array.isArray(metadata.predictions)
      ? metadata.predictions
      : [];
  const detections: Record<string, unknown>[] = [];
  for (const detection of rawDetections) {
    if (isRecord(detection)) detections.push(detection);
  }
  const labels = uniqueStrings([
    ...toStringArray(metadata.labels),
    ...detections.map((detection) => detection.label).filter((label): label is string => typeof label === "string"),
    ...toStringArray(event.data.matchedLabels),
  ]);
  const confidenceValues = [
    toFiniteNumber(metadata.confidence),
    ...detections.map((detection) => toFiniteNumber(detection.confidence)),
  ].filter((value): value is number => value !== null);
  const confidence = confidenceValues.length > 0 ? Math.max(...confidenceValues) : null;
  const detectionCount = toFiniteNumber(metadata.detectionCount) ?? detections.length;
  const atSec = toFiniteNumber(metadata.atSec);
  const subject = labels.length > 0 ? labels.map(humanize).join(", ") : "the highlighted activity";

  if (attachment?.kind === "image") {
    const detectionSummary =
      detectionCount > 0
        ? `${detectionCount} detection${detectionCount === 1 ? "" : "s"}${labels.length > 0 ? `: ${subject}` : ""}`
        : subject;
    const parts = [`Bounding boxes mark ${detectionSummary.toLowerCase()}`];
    if (atSec !== null) parts.push(`captured ${atSec.toFixed(1)} seconds into the clip`);
    if (confidence !== null) parts.push(`with up to ${Math.round(confidence * 100)}% confidence`);
    return `${parts.join(", ")}.`;
  }

  const reason = asText(event.data.reason);
  if (attachment?.kind === "video") {
    return reason ? `Review the clip for ${subject.toLowerCase()}. ${reason}` : `Review the clip for ${subject}.`;
  }

  return reason;
}

function DetailRow({ label, value, monospace }: { label: string; value: string; monospace?: boolean }) {
  return (
    <div className="border-border/60 flex items-start justify-between gap-3 border-b px-3 py-2 last:border-b-0">
      <dt className="text-muted-foreground/60 shrink-0 text-[10px]">{label}</dt>
      <dd className={`text-foreground/75 text-right text-[10px] break-words ${monospace ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function buildValueRows(data: Record<string, unknown>): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  for (const key of VALUE_KEYS) {
    const value = data[key];
    if (value === undefined || value === null || value === "") continue;
    rows.push({ label: humanize(key), value: formatValue(key, value, data) });
  }
  return rows;
}

function formatValue(key: string, value: unknown, data: Record<string, unknown>): string {
  if (key === "confidence" && typeof value === "number") return `${Math.round(value * 100)}%`;
  if (key === "value" && data.unit) return `${value}${String(data.unit)}`;
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_:]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
