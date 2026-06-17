/**
 * Tier-2 config codec (design spec §2).
 *
 * Round-trips an editor config object to a URL-safe string for the
 * compound render transport:
 *
 *     /api/render?c=<base64url(gzip(json))>&z=1
 *
 *   - **base64url** alphabet (no `+` `/` `=`) — those characters are
 *     camo-unsafe and churn the CDN cache key.
 *   - **gzip by size**: payloads below GZIP_THRESHOLD bytes ship raw
 *     (gzip's header overhead makes it a net loss on tiny blobs); larger
 *     payloads are gzipped and flagged with `z=1`.
 *   - **version envelope** (`{ v: 1, d: <config> }`) so already-embedded
 *     URLs keep decoding as the config schema evolves.
 *
 * Edge-safe: uses only Web APIs (TextEncoder/Decoder, CompressionStream,
 * btoa/atob, ReadableStream) — no Node `Buffer` or `node:zlib`. Runs
 * unchanged on the Edge runtime and on Node 18+.
 *
 * NOT wired into /api/render yet — that integration waits on the final
 * config/LayoutSpec shape. This module is the standalone, tested codec.
 */

/** Codec version stamped into every envelope. Bump on a breaking change. */
export const CODEC_VERSION = 1;

/**
 * Below this many bytes of JSON, skip gzip: the ~18-byte gzip
 * header/trailer plus base64's 4/3 expansion makes compression a loss on
 * small blobs. Tier-1 readable params cover the small case anyway.
 */
export const GZIP_THRESHOLD = 512;

/**
 * Hard cap on *decompressed* bytes during decode. The gzip blob rides in
 * an attacker-controllable URL, and a tiny blob can inflate to gigabytes
 * — a classic decompression bomb. We abort the moment inflation crosses
 * this line, before `JSON.parse` ever runs. (Surfaced as a known
 * fragility in the pipeline map: §7.3 "decompression bomb on /api/render".)
 */
export const MAX_DECODED_BYTES = 256 * 1024;

export type EncodeResult = {
  /** The `c=` query value: base64url(payload). */
  c: string;
  /** The `z=` query flag: 1 if `c` is gzipped, 0 if raw. */
  z: 0 | 1;
};

/** Every decode/encode failure surfaces as this, with a caller-safe message. */
export class CodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodecError";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encode a config object into `{ c, z }` for the render URL. `z` reports
 * whether `c` was gzipped, so the caller mirrors it into `&z=1`.
 */
export async function encodeConfig(config: unknown): Promise<EncodeResult> {
  let json: string;
  try {
    json = JSON.stringify({ v: CODEC_VERSION, d: config });
  } catch (e) {
    throw new CodecError(`config is not JSON-serializable: ${msg(e)}`);
  }
  const raw = new TextEncoder().encode(json);

  if (raw.length < GZIP_THRESHOLD) {
    return { c: base64urlEncode(raw), z: 0 };
  }

  const gz = await gzip(raw);
  // If gzip *grew* the payload (already high-entropy data), ship raw.
  // The z flag records which branch we took so decode stays symmetric.
  if (gz.length >= raw.length) {
    return { c: base64urlEncode(raw), z: 0 };
  }
  return { c: base64urlEncode(gz), z: 1 };
}

/**
 * Decode a `c=`/`z=` pair back to the original config object. `z` accepts
 * the shapes a URL hands you: boolean, 0/1, or the strings "1"/"0".
 *
 * Throws {@link CodecError} on malformed base64url, a non-gzip payload
 * flagged `z=1`, a decompression bomb, invalid JSON, a missing version
 * envelope, or an unsupported version.
 */
export async function decodeConfig<T = unknown>(
  c: string,
  z: boolean | 0 | 1 | string,
): Promise<T> {
  const gzipped = z === true || z === 1 || z === "1";

  let payload: Uint8Array;
  try {
    payload = base64urlDecode(c);
  } catch (e) {
    throw new CodecError(`malformed base64url in c=: ${msg(e)}`);
  }

  const bytes = await inflateCapped(payload, gzipped, MAX_DECODED_BYTES);

  let obj: unknown;
  try {
    obj = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    throw new CodecError(`payload is not valid JSON: ${msg(e)}`);
  }

  if (!isEnvelope(obj)) {
    throw new CodecError("missing or malformed version envelope");
  }
  if (obj.v !== CODEC_VERSION) {
    throw new CodecError(
      `unsupported codec version v=${obj.v} (this build decodes v=${CODEC_VERSION})`,
    );
  }
  return obj.d as T;
}

/**
 * Convenience: encode a config straight into a `URLSearchParams` carrying
 * `c=` (and `z=1` only when gzipped). This is the exact query shape
 * `/api/render` will consume.
 */
export async function encodeToQuery(config: unknown): Promise<URLSearchParams> {
  const { c, z } = await encodeConfig(config);
  const params = new URLSearchParams();
  params.set("c", c);
  if (z) params.set("z", "1");
  return params;
}

/** Convenience: decode a config from a `URLSearchParams` (`c=` + `z=`). */
export async function decodeFromQuery<T = unknown>(
  params: URLSearchParams,
): Promise<T> {
  const c = params.get("c");
  if (!c) throw new CodecError("missing required c= parameter");
  return decodeConfig<T>(c, params.get("z") ?? 0);
}

/**
 * Decode raw bytes that may be gzipped, enforcing the decompression cap.
 *
 * This is the **single source of the decompression-bomb ceiling**. Both
 * this module's {@link decodeConfig} and the legacy `?spec=` transport in
 * `/api/render` route through here, so the cap lives in exactly one place:
 *
 *   - gzipped: inflate through the streaming gunzip, aborting the moment
 *     the running total crosses `maxBytes` (bounded allocation — the bomb
 *     never fully materializes).
 *   - raw: reject up front if the decoded bytes already exceed the cap.
 *
 * Throws {@link CodecError} on an oversized payload or a non-gzip stream
 * flagged gzipped — callers map that to a clean 400.
 */
export async function inflateCapped(
  bytes: Uint8Array,
  gzipped: boolean,
  maxBytes: number = MAX_DECODED_BYTES,
): Promise<Uint8Array> {
  if (gzipped) return gunzipCapped(bytes, maxBytes);
  if (bytes.length > maxBytes) {
    throw new CodecError(`payload exceeds ${maxBytes}-byte cap`);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Version envelope
// ---------------------------------------------------------------------------

type Envelope = { v: number; d: unknown };

function isEnvelope(o: unknown): o is Envelope {
  return (
    typeof o === "object" &&
    o !== null &&
    typeof (o as Record<string, unknown>).v === "number" &&
    "d" in o
  );
}

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

export function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  // Chunk to stay clear of String.fromCharCode's argument-count ceiling.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlDecode(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(padded); // throws on invalid alphabet → caller wraps
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// gzip via Web Streams (edge-safe; no node:zlib)
// ---------------------------------------------------------------------------

// The DOM lib types CompressionStream's writable as `WritableStream<BufferSource>`
// while a `ReadableStream<Uint8Array>` carries `Uint8Array` chunks; `pipeThrough`
// can't reconcile the two under TS's invariant stream generics. The stream pairs
// are interchangeable at runtime, so we narrow the transform to the pair shape
// `pipeThrough` wants. Isolated here so callers never see the cast.
type ByteTransform = ReadableWritablePair<Uint8Array, Uint8Array>;

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip") as unknown as ByteTransform;
  return collect(bytesToStream(bytes).pipeThrough(cs), Infinity);
}

async function gunzipCapped(
  bytes: Uint8Array,
  maxBytes: number,
): Promise<Uint8Array> {
  let ds: ByteTransform;
  try {
    ds = new DecompressionStream("gzip") as unknown as ByteTransform;
  } catch (e) {
    throw new CodecError(`gzip not supported in this runtime: ${msg(e)}`);
  }
  const stream = bytesToStream(bytes).pipeThrough(ds);
  try {
    return await collect(stream, maxBytes);
  } catch (e) {
    if (e instanceof CodecError) throw e; // bomb-cap message, keep it
    throw new CodecError(`gunzip failed (not a gzip stream?): ${msg(e)}`);
  }
}

function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** Drain a byte stream, aborting if the running total passes `maxBytes`. */
async function collect(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new CodecError(
        `decompressed payload exceeds ${maxBytes}-byte cap (possible decompression bomb)`,
      );
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const ch of chunks) {
    out.set(ch, offset);
    offset += ch.length;
  }
  return out;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
