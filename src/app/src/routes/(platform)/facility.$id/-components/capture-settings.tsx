import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { JsonValue } from "../-helpers/types";

export interface CaptureConfig {
  segments?: { durationSec?: number };
}

interface CaptureSettingsSectionProps {
  capture: JsonValue | undefined;
  isReadOnly: boolean;
  onChange: (next: CaptureConfig) => void;
}

const DEFAULT_CAPTURE: CaptureConfig = {
  segments: { durationSec: 30 },
};

/** Safely coerce any value into a CaptureConfig object. */
function coerceCaptureConfig(raw: JsonValue | undefined): CaptureConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_CAPTURE;
  return raw as unknown as CaptureConfig;
}

export function CaptureSettingsSection({ capture, isReadOnly, onChange }: CaptureSettingsSectionProps) {
  const cfg = coerceCaptureConfig(capture);
  const segments = { ...DEFAULT_CAPTURE.segments, ...cfg.segments };

  return (
    <div className="flex flex-col gap-3">
      {/* ── Segment Duration ── */}
      <div className="flex flex-col gap-1.5">
        <div className="min-w-0">
          <p className="font-medium text-[11px] text-foreground/80">Segment Duration</p>
          <p className="text-[10px] text-muted-foreground/60">
            The CCTV stream is continuously recorded and split into segments of this duration.
          </p>
        </div>

        <div className="flex flex-col gap-1.5 border-border border-t pt-2">
          <Label className="font-medium text-[11px] text-muted-foreground">Duration (seconds)</Label>
          <Input
            className={isReadOnly ? "pointer-events-none opacity-60" : ""}
            max={300}
            min={5}
            onChange={(e) => {
              const v = Number(e.target.value);
              const durationSec = Number.isFinite(v) && v >= 5 ? v : 30;
              onChange({ ...cfg, segments: { durationSec } });
            }}
            readOnly={isReadOnly}
            step={1}
            type="number"
            value={String(segments.durationSec ?? 30)}
          />
          <p className="text-[10px] text-muted-foreground/60">Length of each recorded clip (5–300 s). Default: 30 s.</p>
        </div>
      </div>
    </div>
  );
}
