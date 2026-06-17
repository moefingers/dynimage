import { test } from "node:test";
import assert from "node:assert/strict";
import {
  l1Key,
  stableStringify,
  L1_MAX_BYTES,
  l1ReadThrough,
} from "./l1cache.ts";

// Ensure the degrade path is deterministic regardless of the shell env:
// with no Upstash creds, l1ReadThrough must bypass Redis entirely.
function unsetUpstash(): void {
  delete process.env.UPSTASH_DYNIMAGE_KV_REST_API_URL;
  delete process.env.UPSTASH_DYNIMAGE_KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

// --- stableStringify ---------------------------------------------------

test("stableStringify is key-order independent", () => {
  const a = { b: 1, a: 2, c: { y: 1, x: 2 } };
  const z = { c: { x: 2, y: 1 }, a: 2, b: 1 };
  assert.equal(stableStringify(a), stableStringify(z));
});

test("stableStringify preserves array order and values", () => {
  assert.equal(stableStringify([3, 1, 2]), "[3,1,2]");
  assert.equal(
    stableStringify({ k: [{ b: 1, a: 2 }] }),
    '{"k":[{"a":2,"b":1}]}',
  );
});

test("stableStringify distinguishes genuinely different configs", () => {
  assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }));
});

// --- l1Key -------------------------------------------------------------

test("l1Key is a deterministic 64-char hex digest", async () => {
  const k = await l1Key(["scene", "svg", '{"a":1}', "theme=ocean"]);
  assert.match(k, /^[0-9a-f]{64}$/);
  assert.equal(k, await l1Key(["scene", "svg", '{"a":1}', "theme=ocean"]));
});

test("l1Key changes when any part changes", async () => {
  const base = await l1Key(["scene", "svg", '{"a":1}', ""]);
  assert.notEqual(base, await l1Key(["compound", "svg", '{"a":1}', ""])); // kind
  assert.notEqual(base, await l1Key(["scene", "png", '{"a":1}', ""])); // format
  assert.notEqual(base, await l1Key(["scene", "svg", '{"a":2}', ""])); // config
  assert.notEqual(
    base,
    await l1Key(["scene", "svg", '{"a":1}', "theme=ember"]),
  ); // presentation
});

test("l1Key part boundaries are unambiguous", async () => {
  // ["ab","c"] must not collide with ["a","bc"].
  assert.notEqual(await l1Key(["ab", "c"]), await l1Key(["a", "bc"]));
});

// --- degrade path (no Upstash) ----------------------------------------

test("l1ReadThrough bypasses to a direct render when Redis is unconfigured", async () => {
  unsetUpstash();
  let renders = 0;
  const out = {
    body: "<svg/>",
    contentType: "image/svg+xml",
    etag: '"abc"',
  };
  const res = await l1ReadThrough("any-key", 60_000, async () => {
    renders++;
    return out;
  });
  assert.equal(res.hit, false, "bypass is never reported as a hit");
  assert.deepEqual(res.render, out);
  assert.equal(renders, 1, "render runs exactly once on bypass");
});

test("l1ReadThrough propagates a render error (no swallow)", async () => {
  unsetUpstash();
  await assert.rejects(
    () =>
      l1ReadThrough("k", 60_000, async () => {
        throw new Error("boom");
      }),
    /boom/,
  );
});

// --- size guard constant ----------------------------------------------

test("L1_MAX_BYTES is a sane Upstash-safe ceiling", () => {
  assert.ok(L1_MAX_BYTES > 0 && L1_MAX_BYTES <= 1024 * 1024);
});
