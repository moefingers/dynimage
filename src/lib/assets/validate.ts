// ─────────────────────────────────────────────────────────────────────
// Asset upload validation (spec §10 — SECURITY).
//
// v1 is RASTER-ONLY (png/webp/jpeg). SVG is deliberately NOT accepted: an
// uploaded SVG inlined into rendered output is an XSS vector (<script>,
// <foreignObject>, event handlers), and sanitizing SVG is a losing arms
// race — restricting to raster sidesteps it entirely (lead-approved).
//
// The format is decided by MAGIC BYTES, never the caller-declared
// Content-Type: a request can claim image/png while shipping an SVG/HTML
// payload, so we sniff the actual bytes and reject anything that isn't a
// genuine raster image in the allowlist. A declared mime that disagrees
// with the sniffed type is rejected (defense in depth).
// ─────────────────────────────────────────────────────────────────────

export type AssetMime = "image/png" | "image/webp" | "image/jpeg";

export const ALLOWED_MIMES: ReadonlySet<AssetMime> = new Set<AssetMime>([
  "image/png",
  "image/webp",
  "image/jpeg",
]);

/** Max stored asset size. A logo/image element wants small; 2 MiB is ample. */
export const MAX_ASSET_BYTES = 2 * 1024 * 1024;

export type ValidationOk = { ok: true; mime: AssetMime; size: number };
export type ValidationErr = { ok: false; status: number; error: string };
export type ValidationResult = ValidationOk | ValidationErr;

// Sniff the real image type from the leading bytes. Returns null for
// anything we don't accept (incl. SVG/text/unknown).
export function sniffImageMime(bytes: Uint8Array): AssetMime | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  // WEBP: "RIFF" .... "WEBP" (bytes 0-3 RIFF, 8-11 WEBP)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Validate an uploaded asset by its bytes. `declaredMime` (the request's
 * Content-Type, if any) is cross-checked but never trusted as the source
 * of truth — the sniffed type wins, and a mismatch is rejected.
 */
export function validateAsset(
  bytes: Uint8Array,
  declaredMime?: string | null,
): ValidationResult {
  if (bytes.length === 0) {
    return { ok: false, status: 400, error: "Empty upload." };
  }
  if (bytes.length > MAX_ASSET_BYTES) {
    return {
      ok: false,
      status: 413,
      error: `Asset exceeds the ${MAX_ASSET_BYTES}-byte cap (got ${bytes.length}).`,
    };
  }

  const sniffed = sniffImageMime(bytes);
  if (!sniffed) {
    return {
      ok: false,
      status: 415,
      error:
        "Unsupported image type. Allowed: PNG, WebP, JPEG (raster only — SVG is not accepted).",
    };
  }

  // Defense in depth: if the caller declared a type, it must match the
  // bytes. A normalized image/jpg → image/jpeg alias is tolerated.
  if (declaredMime) {
    const normalized = declaredMime.split(";")[0]!.trim().toLowerCase();
    const aliased = normalized === "image/jpg" ? "image/jpeg" : normalized;
    if (aliased !== sniffed) {
      return {
        ok: false,
        status: 415,
        error: `Declared type "${declaredMime}" does not match the file contents (${sniffed}).`,
      };
    }
  }

  return { ok: true, mime: sniffed, size: bytes.length };
}
