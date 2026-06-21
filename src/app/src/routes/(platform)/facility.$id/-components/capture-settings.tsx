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
          <p className="text-foreground/80 text-[11px] font-medium">Segment Duration</p>
          <p className="text-muted-foreground/60 text-[10px]">
            The CCTV stream is continuously recorded and split into segments of this duration.
          </p>
        </div>

        <div className="border-border flex flex-col gap-1.5 border-t pt-2">
          <Label className="text-muted-foreground text-[11px] font-medium">Duration (seconds)</Label>
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
          <p className="text-muted-foreground/60 text-[10px]">Length of each recorded clip (5–300 s). Default: 30 s.</p>
        </div>
      </div>
    </div>
  );
}
