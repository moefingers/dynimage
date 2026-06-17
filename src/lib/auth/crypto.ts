// Envelope encryption for per-user secrets (GitHub PATs today, any
// provider credential later). KMS-ready by construction:
//
//   plaintext --AES-256-GCM(dataKey, iv)-->            ciphertext
//   dataKey   --AES-256-GCM(masterKey, wrapIv)--> wrappedDataKey
//
// We store {ciphertext, iv, wrappedDataKey, keyVersion}. The master key
// NEVER touches the secret directly — it only wraps a per-secret random
// data key. So key rotation re-wraps data keys (cheap, O(secrets) tiny
// AES ops) instead of re-encrypting every secret, and a future move to a
// real KMS only changes how the data key is wrapped/unwrapped — the
// ciphertext column is untouched. (Spec §4.)
//
// Runs on BOTH edge and node: uses only Web Crypto (`crypto.subtle`,
// `crypto.getRandomValues`) + `btoa`/`atob`, all globally available in
// the Next edge runtime and Node 18+. No Buffer, no node:crypto.
//
// SECURITY INVARIANTS (spec §4):
//   - decrypt only at use, in-memory, on the render request
//   - the plaintext secret is NEVER logged, returned to a client, or
//     written anywhere but the ciphertext column
//   - this module throws typed errors that never embed key or plaintext

const GCM = "AES-GCM";
const IV_BYTES = 12; // 96-bit nonce — the GCM standard
const DATA_KEY_BYTES = 32; // 256-bit per-secret data key

export type EncryptedSecret = {
  /** base64 — AES-256-GCM(dataKey, iv) over the UTF-8 plaintext (tag appended). */
  ciphertext: string;
  /** base64 — 12-byte IV for the ciphertext. */
  iv: string;
  /** base64 — wrapIv(12) ‖ AES-256-GCM(masterKey, wrapIv) over the raw data key. */
  wrappedDataKey: string;
  /** Which master key version wrapped the data key (for rotation). */
  keyVersion: number;
};

// ── base64 helpers (binary-safe, edge+node) ───────────────────────────
function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// Copy a view into a fresh ArrayBuffer so it satisfies Web Crypto's
// BufferSource type (which excludes SharedArrayBuffer-backed views).
function abuf(view: Uint8Array): ArrayBuffer {
  const b = new ArrayBuffer(view.byteLength);
  new Uint8Array(b).set(view);
  return b;
}

// ── master key resolution (versioned for rotation) ────────────────────
// Current version comes from PAT_ENC_KEY (+ PAT_ENC_KEY_VERSION). Older
// versions, kept around so already-wrapped secrets stay decryptable
// through a rotation, are read from PAT_ENC_KEY_V<n>. Imported keys are
// cached per version for the lifetime of the isolate.
const masterKeyCache = new Map<number, Promise<CryptoKey>>();

function currentKeyVersion(): number {
  const v = Number(process.env.PAT_ENC_KEY_VERSION ?? "1");
  if (!Number.isInteger(v) || v < 1) {
    throw new Error("PAT_ENC_KEY_VERSION must be a positive integer");
  }
  return v;
}

function rawMasterKey(version: number): Uint8Array {
  const current = currentKeyVersion();
  const envName = version === current ? "PAT_ENC_KEY" : `PAT_ENC_KEY_V${version}`;
  const b64 = process.env[envName];
  if (!b64) {
    throw new Error(
      `Master key ${envName} is not set. Provide a base64-encoded 32-byte key.`,
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = b64ToBytes(b64);
  } catch {
    throw new Error(`${envName} is not valid base64`);
  }
  if (bytes.length !== 32) {
    throw new Error(
      `${envName} must decode to exactly 32 bytes (got ${bytes.length})`,
    );
  }
  return bytes;
}

function masterKey(version: number): Promise<CryptoKey> {
  let cached = masterKeyCache.get(version);
  if (!cached) {
    cached = crypto.subtle.importKey(
      "raw",
      // Copy into a fresh ArrayBuffer-backed view for BufferSource typing.
      rawMasterKey(version).slice(),
      GCM,
      false,
      ["encrypt", "decrypt"],
    );
    masterKeyCache.set(version, cached);
  }
  return cached;
}

// ── public API ────────────────────────────────────────────────────────

/** Encrypt a secret with a fresh per-secret data key wrapped by the current master key. */
export async function encryptSecret(plaintext: string): Promise<EncryptedSecret> {
  const keyVersion = currentKeyVersion();

  // 1. fresh random data key + import it for AES-GCM
  const dataKeyBytes = crypto.getRandomValues(new Uint8Array(DATA_KEY_BYTES));
  const dataKey = await crypto.subtle.importKey(
    "raw",
    dataKeyBytes.slice(),
    GCM,
    false,
    ["encrypt"],
  );

  // 2. encrypt the plaintext under the data key
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ctBuf = await crypto.subtle.encrypt(
    { name: GCM, iv },
    dataKey,
    new TextEncoder().encode(plaintext),
  );

  // 3. wrap the raw data key under the master key
  const wrapIv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrappedBuf = await crypto.subtle.encrypt(
    { name: GCM, iv: wrapIv },
    await masterKey(keyVersion),
    dataKeyBytes,
  );
  // wrappedDataKey = wrapIv ‖ wrapped(dataKey)
  const wrapped = new Uint8Array(wrapIv.length + wrappedBuf.byteLength);
  wrapped.set(wrapIv, 0);
  wrapped.set(new Uint8Array(wrappedBuf), wrapIv.length);

  return {
    ciphertext: bytesToB64(new Uint8Array(ctBuf)),
    iv: bytesToB64(iv),
    wrappedDataKey: bytesToB64(wrapped),
    keyVersion,
  };
}

/** Decrypt a secret. Returns plaintext in-memory only — caller must never log/persist it. */
export async function decryptSecret(enc: EncryptedSecret): Promise<string> {
  // 1. unwrap the data key with the master key of the recorded version
  const wrapped = b64ToBytes(enc.wrappedDataKey);
  if (wrapped.length <= IV_BYTES) {
    throw new Error("wrappedDataKey is malformed");
  }
  const wrapIv = wrapped.subarray(0, IV_BYTES);
  const wrappedKey = wrapped.subarray(IV_BYTES);
  let dataKeyBytes: ArrayBuffer;
  try {
    dataKeyBytes = await crypto.subtle.decrypt(
      { name: GCM, iv: abuf(wrapIv) },
      await masterKey(enc.keyVersion),
      abuf(wrappedKey),
    );
  } catch {
    // Wrong/rotated-away master key or tampered wrap — never echo details.
    throw new Error("Failed to unwrap data key (bad key version or tampered)");
  }

  // 2. decrypt the ciphertext under the recovered data key
  const dataKey = await crypto.subtle.importKey(
    "raw",
    dataKeyBytes,
    GCM,
    false,
    ["decrypt"],
  );
  try {
    const ptBuf = await crypto.subtle.decrypt(
      { name: GCM, iv: abuf(b64ToBytes(enc.iv)) },
      dataKey,
      abuf(b64ToBytes(enc.ciphertext)),
    );
    return new TextDecoder().decode(ptBuf);
  } catch {
    throw new Error("Failed to decrypt secret (tampered ciphertext or iv)");
  }
}

/**
 * Re-wrap an existing secret's data key under the current master key
 * WITHOUT touching the ciphertext. This is the rotation primitive: when
 * the master key rotates, walk the vault and call this per row. Cheap —
 * one unwrap + one wrap, the secret plaintext is never exposed... except
 * Web Crypto can't move raw key bytes between wraps without exporting, so
 * we unwrap to raw, re-wrap, and the raw data key lives in memory for the
 * duration of this call only (never returned, never logged).
 */
export async function rewrapDataKey(
  enc: EncryptedSecret,
): Promise<Pick<EncryptedSecret, "wrappedDataKey" | "keyVersion">> {
  const wrapped = b64ToBytes(enc.wrappedDataKey);
  const wrapIv = wrapped.subarray(0, IV_BYTES);
  const wrappedKey = wrapped.subarray(IV_BYTES);
  const dataKeyBuf = await crypto.subtle.decrypt(
    { name: GCM, iv: abuf(wrapIv) },
    await masterKey(enc.keyVersion),
    abuf(wrappedKey),
  );

  const keyVersion = currentKeyVersion();
  const newWrapIv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const newWrappedBuf = await crypto.subtle.encrypt(
    { name: GCM, iv: newWrapIv },
    await masterKey(keyVersion),
    dataKeyBuf,
  );
  const out = new Uint8Array(newWrapIv.length + newWrappedBuf.byteLength);
  out.set(newWrapIv, 0);
  out.set(new Uint8Array(newWrappedBuf), newWrapIv.length);
  return { wrappedDataKey: bytesToB64(out), keyVersion };
}
