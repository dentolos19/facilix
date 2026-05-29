import type { PlacedItem } from "#/lib/types";
import { CCTV_MESSAGES, SENSOR_MESSAGES, SIGNAL_MESSAGES } from "./constants";
import type { LogEntry } from "./types";

/** Convert a hex color to an rgba string with the given alpha. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Darken a hex color by mixing towards black. */
export function darkenHex(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = Math.round(parseInt(h.substring(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(h.substring(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(h.substring(4, 6), 16) * (1 - amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Lighten a hex color by mixing towards white. */
export function lightenHex(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = Math.round(parseInt(h.substring(0, 2), 16) + (255 - parseInt(h.substring(0, 2), 16)) * amount);
  const g = Math.round(parseInt(h.substring(2, 4), 16) + (255 - parseInt(h.substring(2, 4), 16)) * amount);
  const b = Math.round(parseInt(h.substring(4, 6), 16) + (255 - parseInt(h.substring(4, 6), 16)) * amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Read the current theme CSS variable values from <html>.
 * These update reactively when next-themes toggles the .dark class.
 */
export function getCanvasColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    background: style.getPropertyValue("--background").trim(),
    border: style.getPropertyValue("--border").trim(),
    mutedForeground: style.getPropertyValue("--muted-foreground").trim(),
  };
}

/** Generate a stable set of mock log entries for every IoT device. */
export function generateMockLogs(items: PlacedItem[]): LogEntry[] {
  const logs: LogEntry[] = [];
  const now = Date.now();

  for (const item of items) {
    if (item.type !== "CCTV" && item.type !== "Sensor" && item.type !== "Signal") continue;

    const pool = item.type === "CCTV" ? CCTV_MESSAGES : item.type === "Sensor" ? SENSOR_MESSAGES : SIGNAL_MESSAGES;
    // generate 4-7 logs per device with staggered timestamps
    const count = 4 + (item.id.charCodeAt(item.id.length - 1) % 4);
    for (let i = 0; i < count; i++) {
      const [msg, level] = pool[i % pool.length];
      logs.push({
        id: `${item.id}-log-${i}`,
        deviceId: item.id,
        deviceName: item.name,
        deviceType: item.type,
        timestamp: new Date(now - (count - i) * 90_000), // one every 90s
        level,
        message: msg,
      });
    }
  }

  return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
