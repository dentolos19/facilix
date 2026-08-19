import type { FacilityLayoutDocument } from "#/lib/layouts";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function getErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as Record<string, unknown>).error;
  return typeof error === "string" && error ? error : fallback;
}

function validateLayoutImage(file: File) {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Use a JPEG, PNG, or WebP image.");
  }
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("The image must be smaller than 8 MB.");
  }
}

/** Generate and validate a facility layout from an uploaded floorplan image. */
export async function generateFacilityLayoutFromFile(
  file: File,
  canvas: { width: number; height: number } = { width: 1000, height: 700 },
): Promise<FacilityLayoutDocument> {
  validateLayoutImage(file);

  const formData = new FormData();
  formData.append("image", file);
  formData.append("canvasWidth", String(canvas.width));
  formData.append("canvasHeight", String(canvas.height));

  const response = await fetch("/api/layouts", { method: "POST", body: formData });
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Failed to generate the facility layout."));
  }
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as Record<string, unknown>).items)) {
    throw new Error("The layout generator returned an unusable JSON response.");
  }

  return payload as FacilityLayoutDocument;
}
