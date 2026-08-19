import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { generateFacilityLayoutFromImage } from "#/lib/ai";
import { getSession } from "#/lib/auth/guard";
import { parseGeneratedFacilityLayout } from "#/lib/layouts";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function dimension(value: FormDataEntryValue | null, fallback: number): number {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const Route = createFileRoute("/api/layouts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getSession(request, env.DATABASE);
        if (!session) return Response.json({ error: "Unauthorized." }, { status: 401 });

        const formData = await request.formData();
        const image = formData.get("image");
        if (!(image instanceof File)) {
          return Response.json({ error: "Choose an image to import." }, { status: 400 });
        }
        if (!SUPPORTED_IMAGE_TYPES.has(image.type)) {
          return Response.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 415 });
        }
        if (image.size === 0 || image.size > MAX_IMAGE_BYTES) {
          return Response.json({ error: "The image must be smaller than 8 MB." }, { status: 413 });
        }

        try {
          const canvas = {
            width: dimension(formData.get("canvasWidth"), 1000),
            height: dimension(formData.get("canvasHeight"), 700),
          };
          const result = await generateFacilityLayoutFromImage(await image.arrayBuffer(), image.type, canvas);

          let layout;
          try {
            layout = parseGeneratedFacilityLayout(result, canvas);
          } catch (error) {
            const message = error instanceof Error ? error.message : "The AI returned an invalid facility layout.";
            return Response.json({ error: message }, { status: 422 });
          }

          return Response.json(layout);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to generate the facility layout.";
          return Response.json({ error: message }, { status: 502 });
        }
      },
    },
  },
});
