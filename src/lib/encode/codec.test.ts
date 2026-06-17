import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeConfig,
  decodeConfig,
  encodeToQuery,
  decodeFromQuery,
  inflateCapped,
  base64urlEncode,
  base64urlDecode,
  CodecError,
  CODEC_VERSION,
  GZIP_THRESHOLD,
  MAX_DECODED_BYTES,
} from "./codec.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const blobOf = (obj: unknown) => base64urlEncode(enc(JSON.stringify(obj)));

// --- round-trip --------------------------------------------------------

test("round-trips a small config without gzip (z=0)", async () => {
  const cfg = { theme: "ocean", cards: ["commits", "streak"], w: 800 };
  const { c, z } = await encodeConfig(cfg);
  assert.equal(z, 0, "small payload should not be gzipped");
  assert.deepEqual(await decodeConfig(c, z), cfg);
});

test("round-trips a large config with gzip (z=1)", async () => {
  // Repetitive (highly compressible) payload well over the threshold.
  const cfg = {
    cards: Array.from({ length: 200 }, (_, i) => ({
      type: "commits",
      user: "moefingers",
      theme: "ocean",
      idx: i,
    })),
  };
  const { c, z } = await encodeConfig(cfg);
  assert.equal(z, 1, "large compressible payload should be gzipped");
  assert.deepEqual(await decodeConfig(c, z), cfg);
});

test("preserves nested structure and unicode", async () => {
  const cfg = {
    title: "café ☕ — 日本語 🎉",
    nested: { a: [1, 2, { b: null, c: true }], d: "—" },
    n: -0.5,
  };
  const { c, z } = await encodeConfig(cfg);
  assert.deepEqual(await decodeConfig(c, z), cfg);
});

// --- size threshold ----------------------------------------------------

test("gzip kicks in by size, not below the threshold", async () => {
  const small = await encodeConfig({ s: "a".repeat(50) });
  assert.equal(small.z, 0);

  // Compressible string comfortably past GZIP_THRESHOLD bytes of JSON.
  const big = await encodeConfig({ s: "a".repeat(GZIP_THRESHOLD + 500) });
  assert.equal(big.z, 1);
  assert.deepEqual(await decodeConfig(big.c, big.z), {
    s: "a".repeat(GZIP_THRESHOLD + 500),
  });
});

test("never ships a payload larger than the raw encoding", async () => {
  // The encoder's guarantee: gzip only wins when it's actually smaller,
  // otherwise it falls back to raw (z=0). Asserting a fixed z for
  // "incompressible" data is brittle — gzip reclaims structural slack
  // even from base64/printable text — so test the real invariant: the
  // chosen `c` is never longer than the raw-base64 alternative, for both
  // a compressible and a high-entropy payload.
  const rnd = new Uint8Array(1500);
  crypto.getRandomValues(rnd);
  const payloads = [
    { tag: "compressible", cfg: { s: "a".repeat(4000) } },
    { tag: "high-entropy", cfg: { s: base64urlEncode(rnd) } },
  ];
  for (const { tag, cfg } of payloads) {
    const { c, z } = await encodeConfig(cfg);
    const rawLen = base64urlEncode(
      enc(JSON.stringify({ v: CODEC_VERSION, d: cfg })),
    ).length;
    assert.ok(c.length <= rawLen, `${tag}: c (${c.length}) > raw (${rawLen})`);
    assert.deepEqual(await decodeConfig(c, z), cfg, `${tag}: round-trip`);
  }
});

// --- base64url hygiene -------------------------------------------------

test("output is URL-safe: no +, /, or = anywhere", async () => {
  const cfg = {
    blob: Array.from({ length: 400 }, (_, i) => ({ k: i, v: i * 7 })),
  };
  const { c } = await encodeConfig(cfg);
  assert.ok(
    !/[+/=]/.test(c),
    `c must be base64url-clean, got: ${c.slice(0, 40)}…`,
  );
  // round-trip still works through a real URLSearchParams
  const params = await encodeToQuery(cfg);
  assert.equal(params.get("c"), c);
  assert.deepEqual(await decodeFromQuery(params), cfg);
});

test("query helper omits z when not gzipped, sets z=1 when gzipped", async () => {
  const small = await encodeToQuery({ a: 1 });
  assert.equal(small.get("z"), null);

  const big = await encodeToQuery({ s: "a".repeat(GZIP_THRESHOLD + 500) });
  assert.equal(big.get("z"), "1");
});

test("decode accepts the z shapes a URL produces", async () => {
  const { c } = await encodeConfig({ ok: true });
  assert.deepEqual(await decodeConfig(c, 0), { ok: true });
  assert.deepEqual(await decodeConfig(c, false), { ok: true });
  assert.deepEqual(await decodeConfig(c, "0"), { ok: true });
});

// --- version envelope --------------------------------------------------

test("stamps the current version and rejects an unknown one", async () => {
  // A v=1 envelope decodes; a forged v=2 envelope is rejected cleanly.
  const future = blobOf({ v: CODEC_VERSION + 1, d: { x: 1 } });
  await assert.rejects(() => decodeConfig(future, 0), {
    name: "CodecError",
    message: /unsupported codec version/,
  });
});

test("rejects a payload with no version envelope", async () => {
  const bare = blobOf({ hello: "world" }); // valid JSON, no v/d
  await assert.rejects(() => decodeConfig(bare, 0), {
    name: "CodecError",
    message: /version envelope/,
  });
});

// --- malformed input ---------------------------------------------------

test("rejects malformed base64url", async () => {
  await assert.rejects(() => decodeConfig("@@@not base64@@@", 0), CodecError);
});

test("rejects invalid JSON inside a well-formed blob", async () => {
  const notJson = base64urlEncode(enc("{ this is not json"));
  await assert.rejects(() => decodeConfig(notJson, 0), {
    name: "CodecError",
    message: /not valid JSON/,
  });
});

test("rejects z=1 on a payload that isn't a gzip stream", async () => {
  const raw = base64urlEncode(enc(JSON.stringify({ v: CODEC_VERSION, d: {} })));
  await assert.rejects(() => decodeConfig(raw, 1), {
    name: "CodecError",
    message: /gunzip failed/,
  });
});

test("missing c= in query rejects cleanly", async () => {
  await assert.rejects(() => decodeFromQuery(new URLSearchParams("z=1")), {
    name: "CodecError",
    message: /missing required c=/,
  });
});

// --- decompression bomb (deputy hotspot #3b) ---------------------------

test("rejects a decompression bomb before JSON.parse, as a clean CodecError", async () => {
  // A small input that inflates far past the cap: ~1MB of one repeated
  // char gzips to a few hundred bytes, then inflates back over the
  // 256KB ceiling on decode.
  const huge = "a".repeat(MAX_DECODED_BYTES * 4);
  const { c, z } = await encodeConfig({ s: huge });
  assert.equal(z, 1, "the bomb payload must actually be gzipped");
  assert.ok(c.length < 5000, "a real bomb is tiny on the wire");

  await assert.rejects(() => decodeConfig(c, z), {
    name: "CodecError",
    message: /exceeds .* cap|decompression bomb/,
  });
});

test("a payload exactly within the cap still decodes", async () => {
  // Just under the ceiling once enveloped — must NOT be rejected.
  const s = "b".repeat(MAX_DECODED_BYTES - 256);
  const { c, z } = await encodeConfig({ s });
  assert.deepEqual(await decodeConfig(c, z), { s });
});

test("rejects an oversized non-gzipped payload too", async () => {
  // z=0 path also enforces the cap (raw base64 that decodes past it).
  const big = base64urlEncode(new Uint8Array(MAX_DECODED_BYTES + 1));
  await assert.rejects(() => decodeConfig(big, 0), {
    name: "CodecError",
    message: /cap/,
  });
});

// --- inflateCapped: the single-sourced cap that /api/render delegates to -

test("inflateCapped aborts a gzip bomb mid-stream (route-level cap control)", async () => {
  // Mirrors exactly what /api/render's ?spec=&z=1 path now runs: decode
  // bytes → inflateCapped. A tiny gzip that inflates past the ceiling
  // must throw before any unbounded allocation.
  const { c, z } = await encodeConfig({ s: "a".repeat(MAX_DECODED_BYTES * 4) });
  assert.equal(z, 1);
  const gzBytes = base64urlDecode(c);
  assert.ok(gzBytes.length < 5000, "bomb is tiny on the wire");
  await assert.rejects(() => inflateCapped(gzBytes, true), {
    name: "CodecError",
    message: /exceeds .* cap|decompression bomb/,
  });
});

test("inflateCapped rejects an oversized raw payload", async () => {
  await assert.rejects(
    () => inflateCapped(new Uint8Array(MAX_DECODED_BYTES + 1), false),
    { name: "CodecError", message: /cap/ },
  );
});

test("inflateCapped passes through within-cap raw and gzip payloads", async () => {
  const raw = enc("hello");
  assert.deepEqual(await inflateCapped(raw, false), raw);

  const { c, z } = await encodeConfig({ s: "x".repeat(GZIP_THRESHOLD + 100) });
  assert.equal(z, 1);
  const out = await inflateCapped(base64urlDecode(c), true);
  const parsed = JSON.parse(new TextDecoder().decode(out));
  assert.equal(parsed.v, CODEC_VERSION);
});
