import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAsset,
  sniffImageMime,
  MAX_ASSET_BYTES,
  ALLOWED_MIMES,
} from "./validate.ts";

// Minimal real magic-byte headers padded out to a few bytes.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0,
]);
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
const HTML = new TextEncoder().encode("<!doctype html><script>evil()</script>");

// --- sniff --------------------------------------------------------------

test("sniffImageMime detects the three allowed raster types", () => {
  assert.equal(sniffImageMime(PNG), "image/png");
  assert.equal(sniffImageMime(JPEG), "image/jpeg");
  assert.equal(sniffImageMime(WEBP), "image/webp");
});

test("sniffImageMime returns null for SVG / HTML / junk", () => {
  assert.equal(sniffImageMime(SVG), null);
  assert.equal(sniffImageMime(HTML), null);
  assert.equal(sniffImageMime(new Uint8Array([1, 2, 3])), null);
  assert.equal(sniffImageMime(new Uint8Array(0)), null);
  // RIFF without WEBP (e.g. a WAV) must not pass as webp
  assert.equal(
    sniffImageMime(
      new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]),
    ),
    null,
  );
});

// --- validateAsset: accept -------------------------------------------

test("validateAsset accepts genuine raster, returns sniffed mime + size", () => {
  assert.deepEqual(validateAsset(PNG), {
    ok: true,
    mime: "image/png",
    size: PNG.length,
  });
  assert.deepEqual(validateAsset(JPEG, "image/jpeg"), {
    ok: true,
    mime: "image/jpeg",
    size: JPEG.length,
  });
  // image/jpg alias tolerated against a real JPEG
  assert.equal(validateAsset(JPEG, "image/jpg").ok, true);
});

// --- validateAsset: the security rejections ---------------------------

test("validateAsset REJECTS an SVG even when declared image/png (XSS vector)", () => {
  const r = validateAsset(SVG, "image/png");
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 415);
});

test("validateAsset rejects a content-type that lies about the bytes", () => {
  // genuine PNG bytes but declared as svg → mismatch rejected
  const r = validateAsset(PNG, "image/svg+xml");
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 415);
});

test("validateAsset rejects oversize uploads (413) and empty (400)", () => {
  const big = new Uint8Array(MAX_ASSET_BYTES + 1);
  big.set(PNG, 0); // valid header, but too big
  const r = validateAsset(big);
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 413);

  const e = validateAsset(new Uint8Array(0));
  assert.equal(e.ok, false);
  assert.equal((e as { status: number }).status, 400);
});

test("validateAsset accepts a payload exactly at the cap", () => {
  const atCap = new Uint8Array(MAX_ASSET_BYTES);
  atCap.set(PNG, 0);
  assert.equal(validateAsset(atCap).ok, true);
});

test("the allowlist is exactly the three raster types (no SVG)", () => {
  assert.deepEqual(
    [...ALLOWED_MIMES].sort(),
    ["image/jpeg", "image/png", "image/webp"],
  );
  assert.ok(!ALLOWED_MIMES.has("image/svg+xml" as never));
});
