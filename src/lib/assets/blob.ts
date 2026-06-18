import { put, del } from "@vercel/blob";
import type { AssetMime } from "./validate";

// ─────────────────────────────────────────────────────────────────────
// Vercel Blob storage for uploaded assets (spec §10). Blob is the bytes'
// home — SEPARATE from render caching (Upstash L1/L2). Public access so a
// rendered embed can reference the URL; the asset id namespaces the path.
//
// Lazy/gated: requires BLOB_READ_WRITE_TOKEN (Vercel Blob integration). We
// never touch it at import time, and callers should check blobConfigured()
// to degrade with a clear error rather than throwing deep in `put`.
// ─────────────────────────────────────────────────────────────────────

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export type UploadedBlob = { url: string; pathname: string };

/**
 * Upload validated asset bytes under a stable, id-namespaced path. The id
 * is unguessable (genId), and `addRandomSuffix:false` keeps the pathname
 * deterministic so it can be derived/deleted from the stored row.
 */
export async function uploadAssetBlob(
  id: string,
  bytes: Uint8Array,
  mime: AssetMime,
): Promise<UploadedBlob> {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const pathname = `assets/${id}.${ext}`;
  // Wrap into a Blob — @vercel/blob's PutBody doesn't take a bare
  // Uint8Array, and a concrete ArrayBuffer is needed (not the input view's
  // ArrayBufferLike) to satisfy BlobPart. The contentType stays authoritative.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const result = await put(pathname, new Blob([ab], { type: mime }), {
    access: "public",
    contentType: mime,
    addRandomSuffix: false,
  });
  return { url: result.url, pathname: result.pathname };
}

/** Delete an asset's blob by its stored pathname (best-effort cleanup). */
export async function deleteAssetBlob(pathname: string): Promise<void> {
  await del(pathname);
}
