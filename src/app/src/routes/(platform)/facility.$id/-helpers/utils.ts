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
