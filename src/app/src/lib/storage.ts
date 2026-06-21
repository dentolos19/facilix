import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { asset } from "#/lib/database/schema";

export { asset } from "#/lib/database/schema";

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function createStorage({ bucket, db: binding }: { bucket: R2Bucket; db: D1Database }) {
  const db = drizzle(binding);

  return {
    async createFile(data: ArrayBuffer, metadata: { name: string; type: string }) {
      const id = crypto.randomUUID();
      const hash = hex(await crypto.subtle.digest("SHA-256", data));
      const now = new Date();

      await bucket.put(id, data, {
        httpMetadata: { contentType: metadata.type },
        customMetadata: { name: metadata.name },
        sha256: hash,
      });

      const row = {
        id,
        name: metadata.name,
        type: metadata.type,
        size: data.byteLength,
        hash,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(asset).values(row);

      return row;
    },

    getFile(key: string): Promise<R2ObjectBody | null> {
      return bucket.get(key);
    },

    getFileStream(key: string): Promise<ReadableStream | null> {
      return bucket.get(key).then((object) => object?.body ?? null);
    },

    async deleteFile(key: string): Promise<void> {
      await bucket.delete(key);
      await db.delete(asset).where(eq(asset.id, key));
    },

    async syncAssets() {
      const bucketIds = new Set<string>();
      const created: Array<{ id: string; name: string }> = [];

      // Paginate through all objects in the bucket
      let cursor: string | undefined;
      do {
        const listed = await bucket.list({
          include: ["httpMetadata", "customMetadata"],
          cursor,
        });
        for (const obj of listed.objects) {
          bucketIds.add(obj.key);
        }
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);

      // Get all existing asset rows
      const rows = await db.select({ id: asset.id }).from(asset);
      const assetIds = new Set(rows.map((r) => r.id));

      // Remove orphan asset rows (in DB but not in bucket)
      const orphanIds = rows.filter((r) => !bucketIds.has(r.id)).map((r) => r.id);
      if (orphanIds.length > 0) {
        await db.delete(asset).where(inArray(asset.id, orphanIds));
      }

      // Create asset rows for bucket objects missing from DB
      cursor = undefined;
      do {
        const listed = await bucket.list({
          include: ["httpMetadata", "customMetadata"],
          cursor,
        });
        for (const obj of listed.objects) {
          if (assetIds.has(obj.key)) continue;

          const now = new Date();

          created.push({
            id: obj.key,
            name: obj.customMetadata?.name ?? obj.key,
          });

          await db.insert(asset).values({
            id: obj.key,
            name: obj.customMetadata?.name ?? obj.key,
            type: obj.httpMetadata?.contentType ?? "application/octet-stream",
            size: obj.size,
            hash: "",
            createdAt: now,
            updatedAt: now,
          });
        }
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);

      return { removed: orphanIds.length, created: created.length };
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;
