import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveCacheKey } from "./cache-key.ts";

// The cache-key vantage rule is the load-bearing privacy invariant
// (spec §3/§6/§14.5): a private-inclusive value must NEVER be written under
// the shared `:public` key, where a public embedder would read it. These
// tests are the falsifiable proof of that rule.

const COMMON = {
  provider: "github",
  subject: "moefingers",
  metric: "user-contributions",
} as const;

test("non-vantage public metric → shared public key, any token", () => {
  const app = deriveCacheKey({
    ...COMMON,
    staticScope: "public",
    vantageSensitive: false,
    tokenSource: "app",
    ownerId: null,
  });
  const pat = deriveCacheKey({
    ...COMMON,
    staticScope: "public",
    vantageSensitive: false,
    tokenSource: "pat",
    ownerId: "u1",
  });
  assert.equal(app.effectivePrivate, false);
  assert.equal(pat.effectivePrivate, false);
  assert.equal(app.key, "github:moefingers:user-contributions:public");
  // a non-sensitive public metric is identical regardless of token → shared
  assert.equal(app.key, pat.key);
});

test("vantage-sensitive + app token → PUBLIC key (public-only value, shared)", () => {
  const r = deriveCacheKey({
    ...COMMON,
    staticScope: "public",
    vantageSensitive: true,
    tokenSource: "app",
    ownerId: null,
  });
  assert.equal(r.effectivePrivate, false);
  assert.equal(r.key, "github:moefingers:user-contributions:public");
});

test("vantage-sensitive + PAT → PRIVATE owner-namespaced key (never public)", () => {
  const r = deriveCacheKey({
    ...COMMON,
    staticScope: "public",
    vantageSensitive: true,
    tokenSource: "pat",
    ownerId: "u1",
  });
  assert.equal(r.effectivePrivate, true);
  assert.equal(r.key, "github:moefingers:user-contributions:private:u1");
  assert.ok(!r.key.endsWith(":public"));
});

test("LEAK TEST: a private-vantage render NEVER shares the public key", () => {
  // The exact attack: an owner's privileged (PAT) render of a vantage-
  // sensitive metric must not collide with the key a public embedder reads.
  const publicEmbedder = deriveCacheKey({
    ...COMMON,
    staticScope: "public",
    vantageSensitive: true,
    tokenSource: "app",
    ownerId: null,
  });
  const ownerPrivileged = deriveCacheKey({
    ...COMMON,
    staticScope: "public",
    vantageSensitive: true,
    tokenSource: "pat",
    ownerId: "u1",
  });
  assert.notEqual(ownerPrivileged.key, publicEmbedder.key);
  assert.equal(publicEmbedder.key, "github:moefingers:user-contributions:public");
});

test("two different owners get isolated private keys", () => {
  const a = deriveCacheKey({
    ...COMMON,
    staticScope: "public",
    vantageSensitive: true,
    tokenSource: "pat",
    ownerId: "alice",
  });
  const b = deriveCacheKey({
    ...COMMON,
    staticScope: "public",
    vantageSensitive: true,
    tokenSource: "pat",
    ownerId: "bob",
  });
  assert.notEqual(a.key, b.key);
});

test("statically-private metric → owner-namespaced even on app token vantage flag", () => {
  const r = deriveCacheKey({
    ...COMMON,
    metric: "private-thing",
    staticScope: "private",
    vantageSensitive: false,
    tokenSource: "pat",
    ownerId: "u1",
  });
  assert.equal(r.effectivePrivate, true);
  assert.equal(r.key, "github:moefingers:private-thing:private:u1");
});
