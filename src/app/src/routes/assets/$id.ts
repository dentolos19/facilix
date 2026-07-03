import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { getSession } from "#/lib/auth/guard";
import { createDatabase, schema } from "#/lib/database";

export const Route = createFileRoute("/assets/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        return streamAsset(params.id, request);
      },
    },
  },
});

function encodeContentDispositionFilename(filename: string) {
  return encodeURIComponent(filename).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function getAttachmentContentDisposition(filename: string) {
  const fallback = filename.replace(/["\\\r\n]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeContentDispositionFilename(filename)}`;
}

function parseRangeHeader(range: string | null, totalSize: number): { offset: number; length: number } | null {
  if (!range || !range.startsWith("bytes=")) return null;
  const spec = range.slice(6).split(",")[0]?.trim();
  if (!spec) return null;
  const [startStr, endStr] = spec.split("-");
  if (!startStr) return null;

  const start = Number.parseInt(startStr, 10);
  if (Number.isNaN(start) || start < 0 || start >= totalSize) return null;

  const end = endStr ? Number.parseInt(endStr, 10) : totalSize - 1;
  if (Number.isNaN(end) || end < start || end >= totalSize) return null;

  return { offset: start, length: end - start + 1 };
}

async function streamAsset(id: string, request: Request): Promise<Response> {
  if (!id) {
    return new Response("Missing asset id.", { status: 400 });
  }

  const session = await getSession(request, env.DATABASE);
  if (!session) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const db = createDatabase(env.DATABASE);
  const [record] = await db.select().from(schema.asset).where(eq(schema.asset.id, id)).limit(1);

  if (!record) {
    return new Response("Asset not found.", { status: 404 });
  }

  const head = await env.BUCKET.head(record.id);

  if (!head) {
    // R2 object is missing but D1 row exists — clean up the orphan.
    await db.delete(schema.asset).where(eq(schema.asset.id, record.id));
    return new Response("Asset not found.", { status: 404 });
  }

  const parsedRange = parseRangeHeader(request.headers.get("range"), head.size);
  const r2Options = parsedRange ? { range: { offset: parsedRange.offset, length: parsedRange.length } } : undefined;
  const object = await env.BUCKET.get(record.id, r2Options);

  if (!object) {
    return new Response("Asset not found.", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");

  // Always ensure content-type from DB record
  if (record.type) {
    headers.set("content-type", record.type);
  } else if (!headers.has("content-type")) {
    headers.set("content-type", "application/octet-stream");
  }

  // Serve partial content for range requests (video seeking).
  if (parsedRange) {
    headers.set("content-length", String(parsedRange.length));
    headers.set(
      "content-range",
      `bytes ${parsedRange.offset}-${parsedRange.offset + parsedRange.length - 1}/${head.size}`,
    );
    return new Response(object.body, { status: 206, headers });
  }

  // Serve as attachment download for browser-initiated requests (e.g. images).
  // For <video> elements the content-disposition header is ignored.
  if (request.headers.get("Accept")?.includes("text/html")) {
    headers.set("content-disposition", getAttachmentContentDisposition(record.name));
  }

  headers.set("content-length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}
