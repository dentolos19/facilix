import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import type { JsonValue } from "../-helpers/types";

export interface CaptureConfig {
  frames?: { enabled?: boolean; intervalSec?: number };
  segments?: { enabled?: boolean; intervalSec?: number; durationSec?: number };
}

interface CaptureSettingsSectionProps {
  capture: JsonValue | undefined;
  isReadOnly: boolean;
  onChange: (next: CaptureConfig) => void;
}

const DEFAULT_CAPTURE: CaptureConfig = {
  frames: { enabled: true, intervalSec: 5 },
  segments: { enabled: true, intervalSec: 30, durationSec: 30 },
};

/** Safely coerce any value into a CaptureConfig object. */
function coerceCaptureConfig(raw: JsonValue | undefined): CaptureConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_CAPTURE;
  return raw as unknown as CaptureConfig;
}

export function CaptureSettingsSection({ capture, isReadOnly, onChange }: CaptureSettingsSectionProps) {
  const cfg = coerceCaptureConfig(capture);
  const frames = { ...DEFAULT_CAPTURE.frames, ...cfg.frames };
  const segments = { ...DEFAULT_CAPTURE.segments, ...cfg.segments };

  return (
    <div className="flex flex-col gap-3">
      {/* ── Frame Capture ── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-[11px] text-foreground/80">Frame Capture</p>
            <p className="text-[10px] text-muted-foreground/60">Snap a JPEG frame from the stream on an interval.</p>
          </div>
          <Switch
            aria-label="Enable frame capture"
            checked={frames.enabled}
            disabled={isReadOnly}
            onCheckedChange={(checked) => onChange({ ...cfg, frames: { ...frames, enabled: checked } })}
            size="sm"
          />
        </div>

        {frames.enabled && (
          <div className="flex flex-col gap-1.5 border-border border-t pt-2">
            <Label className="font-medium text-[11px] text-muted-foreground">Frame interval (seconds)</Label>
            <Input
              className={isReadOnly ? "pointer-events-none opacity-60" : ""}
              max={3600}
              min={1}
              onChange={(e) => {
                const v = Number(e.target.value);
                const intervalSec = Number.isFinite(v) && v >= 1 ? v : 5;
                onChange({ ...cfg, frames: { ...frames, intervalSec } });
              }}
              readOnly={isReadOnly}
              step={1}
              type="number"
              value={String(frames.intervalSec ?? 5)}
            />
            <p className="text-[10px] text-muted-foreground/60">
              How often to capture a frame (1–3600 s). Default: 5 s.
            </p>
          </div>
        )}
      </div>

      {/* ── Segment Capture ── */}
      <div className="flex flex-col gap-1.5 border-border border-t pt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-[11px] text-foreground/80">Segment Capture</p>
            <p className="text-[10px] text-muted-foreground/60">
              Record a short video clip from the stream on an interval.
            </p>
          </div>
          <Switch
            aria-label="Enable segment capture"
            checked={segments.enabled}
            disabled={isReadOnly}
            onCheckedChange={(checked) => onChange({ ...cfg, segments: { ...segments, enabled: checked } })}
            size="sm"
          />
        </div>

        {segments.enabled && (
          <>
            <div className="flex flex-col gap-1.5 border-border border-t pt-2">
              <Label className="font-medium text-[11px] text-muted-foreground">Segment interval (seconds)</Label>
              <Input
                className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                max={3600}
                min={5}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const intervalSec = Number.isFinite(v) && v >= 5 ? v : 30;
                  onChange({ ...cfg, segments: { ...segments, intervalSec } });
                }}
                readOnly={isReadOnly}
                step={1}
                type="number"
                value={String(segments.intervalSec ?? 30)}
              />
              <p className="text-[10px] text-muted-foreground/60">
                How often to record a segment (5–3600 s). Default: 30 s.
              </p>
            </div>

            <div className="flex flex-col gap-1.5 border-border border-t pt-2">
              <Label className="font-medium text-[11px] text-muted-foreground">Segment duration (seconds)</Label>
              <Input
                className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                max={300}
                min={5}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  const durationSec = Number.isFinite(v) && v >= 5 ? v : 30;
                  onChange({ ...cfg, segments: { ...segments, durationSec } });
                }}
                readOnly={isReadOnly}
                step={1}
                type="number"
                value={String(segments.durationSec ?? 30)}
              />
              <p className="text-[10px] text-muted-foreground/60">
                Length of each recorded clip (5–300 s). Default: 30 s.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
