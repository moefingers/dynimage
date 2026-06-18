import { getAsset } from "./store";

// ─────────────────────────────────────────────────────────────────────
// Asset → data-URI resolver for the render path (spec §10).
//
// The logo/image element references an uploaded asset by ID. At render
// time we fetch OUR stored Blob bytes and inline them as a base64 data-URI
// in the SVG <image>. Inlining (vs an external <image href>) keeps the
// rendered output self-contained — no second camo fetch, works offline,
// and the raster bytes can't carry script (unlike an inlined SVG, which is
// why uploads are raster-only).
//
// SSRF GUARD: we only ever fetch the URL stored on the asset row, AND only
// if its host is our Vercel Blob storage. The fetched URL is never taken
// from user request input — the element supplies an id, we look up the row.
// ─────────────────────────────────────────────────────────────────────

// Vercel Blob public URLs are <store>.public.blob.vercel-storage.com.
const ALLOWED_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export type ResolvedAsset = { dataUri: string; mime: string };

export async function resolveAsset(id: string): Promise<ResolvedAsset | null> {
  const row = await getAsset(id);
  if (!row) return null;

  let host: string;
  try {
    host = new URL(row.blobUrl).host;
  } catch {
    return null;
  }
  // Defense in depth: the stored URL must be our blob host. (It always is —
  // we set it from put() — but never fetch a row whose URL was tampered.)
  if (!host.endsWith(ALLOWED_HOST_SUFFIX)) return null;

  const res = await fetch(row.blobUrl);
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());

  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return { dataUri: `data:${row.mime};base64,${btoa(bin)}`, mime: row.mime };
}
