import { test } from "node:test";
import assert from "node:assert/strict";

// Self-contained: set a random master key BEFORE the crypto module reads
// it (it reads env lazily at call time, so static import is fine). No
// .env dependency — runs the same in hooks/CI as locally.
process.env.PAT_ENC_KEY = Buffer.from(
  crypto.getRandomValues(new Uint8Array(32)),
).toString("base64");
process.env.PAT_ENC_KEY_VERSION = "1";

import { encryptSecret, decryptSecret, rewrapDataKey } from "./crypto.ts";

const SECRET = "github_pat_11ABCDE_thisIsNotARealTokenForTestsOnly_0987654321";

// Flip one byte of a base64 payload and return the re-encoded base64.
function flipByte(b64: string, i = 0): string {
  const buf = Buffer.from(b64, "base64");
  buf[i] = buf[i]! ^ 0xff;
  return buf.toString("base64");
}

test("roundtrip: decrypt(encrypt(x)) === x", async () => {
  const enc = await encryptSecret(SECRET);
  assert.equal(await decryptSecret(enc), SECRET);
});

test("nondeterministic: same plaintext → different ciphertext/iv/wrap", async () => {
  const a = await encryptSecret(SECRET);
  const b = await encryptSecret(SECRET);
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.wrappedDataKey, b.wrappedDataKey);
  // both still decrypt correctly
  assert.equal(await decryptSecret(a), SECRET);
  assert.equal(await decryptSecret(b), SECRET);
});

test("GCM tamper-detect: flipped ciphertext byte → throws", async () => {
  const enc = await encryptSecret(SECRET);
  const tampered = { ...enc, ciphertext: flipByte(enc.ciphertext, 0) };
  await assert.rejects(() => decryptSecret(tampered));
});

test("GCM tamper-detect: flipped iv byte → throws", async () => {
  const enc = await encryptSecret(SECRET);
  const tampered = { ...enc, iv: flipByte(enc.iv, 0) };
  await assert.rejects(() => decryptSecret(tampered));
});

test("tampered wrappedDataKey → throws (unwrap fails)", async () => {
  const enc = await encryptSecret(SECRET);
  // flip a byte past the 12-byte wrap IV so the wrapped key itself changes
  const tampered = { ...enc, wrappedDataKey: flipByte(enc.wrappedDataKey, 13) };
  await assert.rejects(() => decryptSecret(tampered));
});

test("rewrap: rewrapDataKey then decrypt still works", async () => {
  const enc = await encryptSecret(SECRET);
  const rw = await rewrapDataKey(enc);
  // ciphertext untouched; only the wrapped data key changed
  assert.equal(rw.keyVersion, enc.keyVersion);
  assert.equal(await decryptSecret({ ...enc, ...rw }), SECRET);
});

test("wrong/absent key version → throws", async () => {
  const enc = await encryptSecret(SECRET);
  // version 99 has no PAT_ENC_KEY_V99 in env
  await assert.rejects(() => decryptSecret({ ...enc, keyVersion: 99 }));
});

test("malformed wrappedDataKey → throws", async () => {
  const enc = await encryptSecret(SECRET);
  // too short to contain even the wrap IV
  await assert.rejects(() => decryptSecret({ ...enc, wrappedDataKey: "AA" }));
});
