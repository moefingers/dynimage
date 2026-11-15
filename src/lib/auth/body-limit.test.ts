import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

import {
  AUTH_BODY_LIMIT_BYTES,
  refuseOversizedAuthBody,
} from "./body-limit.ts";
import { REDIRECT_MAX_CHARS, safeRedirect } from "./redirect.ts";

// Better Auth's handler, as a stand-in that reads the request as it would:
// what these tests ask is what reaches it, and what doesn't.
type Received = {
  url: string;
  method: string;
  contentType: string | null;
  bytes: Uint8Array;
};
let received: Received[] = [];
const handler = refuseOversizedAuthBody(async (request) => {
  received.push({
    url: request.url,
    method: request.method,
    contentType: request.headers.get("content-type"),
    bytes: new Uint8Array(await request.arrayBuffer()),
  });
  return Response.json({ ok: true });
});

const URL_ = "https://dynimage.example/api/auth/sign-in/social";

// A body of `size` bytes, each of which says where it sits, so a passed body
// is checked byte for byte.
const bytesOf = (size: number) =>
  Uint8Array.from({ length: size }, (_, i) => i % 251);

// A stream with no content-length, as a chunked request is.
function chunked(bytes: Uint8Array, chunk = 16 * 1024) {
  const pulled = { chunks: 0 };
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      pulled.chunks += 1;
      controller.enqueue(bytes.slice(offset, offset + chunk));
      offset += chunk;
    },
  });
  return { stream, pulled };
}

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request(URL_, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
    duplex: "half",
  } as RequestInit);

let warn: ReturnType<typeof mock.method>;
beforeEach(() => {
  received = [];
  warn = mock.method(console, "warn", () => undefined);
});
afterEach(() => {
  warn.mock.restore();
});

test("refuses a body one byte over the limit with 413, before Better Auth runs", async () => {
  const res = await handler(post(bytesOf(AUTH_BODY_LIMIT_BYTES + 1)));
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), {
    code: "BODY_TOO_LARGE",
    message: "This request is too large.",
  });
  assert.deepEqual(received, []);
  // Logged by path alone, nothing of the body.
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(
    (warn.mock.calls[0]!.arguments[1] as { path: string }).path,
    "/api/auth/sign-in/social",
  );
});

test("passes a body of exactly the limit on, byte for byte, with its url and headers", async () => {
  const bytes = bytesOf(AUTH_BODY_LIMIT_BYTES);
  const res = await handler(post(bytes));
  assert.equal(res.status, 200);
  assert.equal(received.length, 1);
  assert.equal(received[0]!.url, URL_);
  assert.equal(received[0]!.method, "POST");
  assert.equal(received[0]!.contentType, "application/json");
  assert.ok(Buffer.from(received[0]!.bytes).equals(Buffer.from(bytes)));
});

test("the limit is 32 KiB", () => {
  assert.equal(AUTH_BODY_LIMIT_BYTES, 32 * 1024);
});

test("passes the largest sign-in a real page can send", async () => {
  // auth-form.tsx sends signIn.social({ callbackURL: safeRedirect(?redirect=) }):
  // at most REDIRECT_MAX_CHARS of plain ASCII, the editor's whole-scene
  // target at its longest, which JSON carries one byte per character.
  const longest = safeRedirect(
    "/editor?s=" + "A".repeat(REDIRECT_MAX_CHARS - 10),
    "https://dynimage.vercel.app",
  );
  assert.equal(longest.length, REDIRECT_MAX_CHARS);
  const body = JSON.stringify({ provider: "github", callbackURL: longest });
  const size = new TextEncoder().encode(body).byteLength;
  assert.ok(size > 16_000, `largest real body is ${size} bytes`);
  assert.ok(size * 1.9 < AUTH_BODY_LIMIT_BYTES);

  const res = await handler(post(body));
  assert.equal(res.status, 200);
  assert.equal(new TextDecoder().decode(received[0]!.bytes), body);
});

test("refuses a body carrying scopes with 400, before Better Auth runs", async () => {
  const body = JSON.stringify({
    provider: "github",
    callbackURL: "/account",
    scopes: Array.from({ length: 1000 }, () => 1),
  });
  const res = await handler(post(body));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    code: "FIELD_NOT_ALLOWED",
    message: 'This request may not carry "scopes".',
  });
  assert.deepEqual(received, []);
});

test("refuses scopes on /link-social too, even empty", async () => {
  const req = new Request("https://dynimage.example/api/auth/link-social", {
    method: "POST",
    body: JSON.stringify({ provider: "github", scopes: [] }),
    headers: { "content-type": "application/json" },
  });
  const res = await handler(req);
  assert.equal(res.status, 400);
  assert.deepEqual(received, []);
});

test("refuses scopes under any media type better-call reads as JSON", async () => {
  const res = await handler(
    post(JSON.stringify({ scopes: [1] }), {
      "content-type": "application/vnd.api+json; charset=utf-8",
    }),
  );
  assert.equal(res.status, 400);
  assert.deepEqual(received, []);
});

test("refuses additionalParams, the other unbounded collection", async () => {
  const additionalParams = Object.fromEntries(
    Array.from({ length: 500 }, (_, i) => [`k${i}`, i]),
  );
  const res = await handler(
    post(JSON.stringify({ provider: "github", additionalParams })),
  );
  assert.equal(res.status, 400);
  assert.equal(
    ((await res.json()) as { message: string }).message,
    'This request may not carry "additionalParams".',
  );
  assert.deepEqual(received, []);
});

test("passes a real sign-in body without scopes on, unchanged", async () => {
  const body = JSON.stringify({ provider: "github", callbackURL: "/account" });
  const res = await handler(post(body));
  assert.equal(res.status, 200);
  assert.equal(new TextDecoder().decode(received[0]!.bytes), body);
});

test("passes a non-JSON body or malformed JSON on for Better Auth to answer", async () => {
  // Form bodies parse into flat strings, never an array; malformed JSON gets
  // Better Auth's own single 400.
  const form = await handler(
    post("scopes=1&scopes=2", {
      "content-type": "application/x-www-form-urlencoded",
    }),
  );
  assert.equal(form.status, 200);
  const broken = await handler(post('{"scopes": [1, 1,'));
  assert.equal(broken.status, 200);
  assert.equal(received.length, 2);
});

test("refuses a chunked body with no content-length once it passes the limit, without reading the rest", async () => {
  const { stream, pulled } = chunked(bytesOf(AUTH_BODY_LIMIT_BYTES * 8));
  const req = post(stream);
  assert.equal(req.headers.get("content-length"), null);
  const res = await handler(req);
  assert.equal(res.status, 413);
  assert.deepEqual(received, []);
  // The stream's queue may hold a chunk past the one that went over, never the rest.
  assert.ok(pulled.chunks < Math.ceil(AUTH_BODY_LIMIT_BYTES / (16 * 1024)) + 3);
});

test("passes a chunked body under the limit on, byte for byte", async () => {
  const bytes = bytesOf(Math.floor(AUTH_BODY_LIMIT_BYTES * 0.75));
  const { stream } = chunked(bytes, 4 * 1024);
  const res = await handler(post(stream));
  assert.equal(res.status, 200);
  assert.ok(Buffer.from(received[0]!.bytes).equals(Buffer.from(bytes)));
});

test("refuses on a large content-length alone, reading none of the body", async () => {
  const { stream, pulled } = chunked(bytesOf(1024));
  const res = await handler(
    post(stream, { "content-length": String(AUTH_BODY_LIMIT_BYTES + 1) }),
  );
  assert.equal(res.status, 413);
  assert.deepEqual(received, []);
  assert.ok(pulled.chunks <= 1);
});

test("doesn't trust a small content-length over the body it's sent with", async () => {
  const { stream } = chunked(bytesOf(AUTH_BODY_LIMIT_BYTES * 2));
  const res = await handler(post(stream, { "content-length": "10" }));
  assert.equal(res.status, 413);
  assert.deepEqual(received, []);
});

test("passes a request with no body as it came", async () => {
  const res = await handler(new Request(URL_, { method: "POST" }));
  assert.equal(res.status, 200);
  assert.equal(received.length, 1);
  assert.equal(received[0]!.bytes.byteLength, 0);
});

test("answers 400 when the body stream fails", async () => {
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new Error("connection reset"));
    },
  });
  const res = await handler(post(stream));
  assert.equal(res.status, 400);
  assert.deepEqual(received, []);
});
