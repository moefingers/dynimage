import { inflateCapped } from "@/lib/encode/codec";
import { LayoutSpec } from "@/lib/cards/spec";
import { renderCompound } from "@/lib/cards/compound";
import { Scene } from "@/lib/scene/scene-spec";
import { renderScene } from "@/lib/scene/render";
import { etagOf } from "@/lib/cards/etag";
import type { CardFormat } from "@/lib/cards/types";

// Render endpoint. Two config shapes, three transports, one Node runtime
// (Skia/sharp compositing is Node-only):
//
//   Scene (scene/element model — §1/§2):
//     GET  /api/render?scene=<base64url-of-JSON>&format=png  (&z=1 gzip)
//     POST /api/render?format=png   Body: { v:1, canvas, elements }
//   LayoutSpec (legacy compound — retained during transition):
//     GET  /api/render?spec=<base64-of-JSON>&format=png      (&z=1 gzip)
//     POST /api/render?format=png   Body: { v:1, w, h, cards }
//
// GET picks the path by which param is present; POST sniffs the body
// shape (`elements` ⇒ Scene, `cards` ⇒ LayoutSpec). The Tier-2 codec
// (builder-2, ?c=) will decode to a Scene and call the same renderScene.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_FORMATS = new Set<CardFormat>(["svg", "png", "webp", "avif"]);

// Single decode path for BOTH transports (?scene= and ?spec=). The
// inflate is size-capped BEFORE JSON.parse: `inflateCapped` aborts a gzip
// bomb mid-stream and rejects an oversized raw payload, so an
// attacker-supplied &z=1 on either param can never balloon memory — it
// throws a CodecError, surfaced as a clean 400 by each caller. Single
// source of the ceiling: MAX_DECODED_BYTES in lib/encode/codec.
async function decodeParam(param: string, gzipped: boolean): Promise<unknown> {
  const raw = decodeBase64Url(param);
  const bytes = await inflateCapped(raw, gzipped);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "svg";
  const sceneParam = url.searchParams.get("scene");
  const specParam = url.searchParams.get("spec");
  const gzipped = url.searchParams.get("z") === "1";

  if (!VALID_FORMATS.has(format as CardFormat)) {
    return new Response(
      `Invalid format "${format}". Supported: ${[...VALID_FORMATS].join(", ")}.`,
      { status: 400 },
    );
  }
  if (!sceneParam && !specParam) {
    return new Response(
      "Missing config. Pass ?scene=<base64url(JSON)> (scene/element model) or ?spec=<base64(JSON)> (legacy compound); add &z=1 if gzipped.",
      { status: 400 },
    );
  }

  if (sceneParam) {
    let sceneJson: unknown;
    try {
      sceneJson = await decodeParam(sceneParam, gzipped);
    } catch (e) {
      return new Response(`Failed to decode scene: ${errMessage(e)}`, {
        status: 400,
      });
    }
    return renderSceneAndRespond(sceneJson, format as CardFormat, request, url);
  }

  let specJson: unknown;
  try {
    specJson = await decodeParam(specParam!, gzipped);
  } catch (e) {
    return new Response(`Failed to decode spec: ${errMessage(e)}`, {
      status: 400,
    });
  }
  return renderAndRespond(specJson, format as CardFormat, request, url);
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "svg";

  if (!VALID_FORMATS.has(format as CardFormat)) {
    return new Response(
      `Invalid format "${format}". Supported: ${[...VALID_FORMATS].join(", ")}.`,
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(`Body is not valid JSON: ${errMessage(e)}`, {
      status: 400,
    });
  }

  // Sniff the config shape: a Scene has `elements`; a LayoutSpec has `cards`.
  if (body && typeof body === "object" && "elements" in body) {
    return renderSceneAndRespond(body, format as CardFormat, request, url);
  }
  return renderAndRespond(body, format as CardFormat, request, url);
}

async function renderSceneAndRespond(
  rawScene: unknown,
  format: CardFormat,
  request: Request,
  url: URL,
): Promise<Response> {
  const parsed = Scene.safeParse(rawScene);
  if (!parsed.success) {
    return new Response(`Invalid Scene: ${parsed.error.message}`, {
      status: 400,
    });
  }

  let rendered;
  try {
    rendered = await renderScene(
      parsed.data,
      format,
      `${url.protocol}//${url.host}`,
      url.searchParams,
    );
  } catch (e) {
    return new Response(`Render failed: ${errMessage(e)}`, { status: 500 });
  }

  const etag = await etagOf(rendered.body);
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control":
          "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  }

  const body =
    typeof rendered.body === "string"
      ? rendered.body
      : (rendered.body as BodyInit);

  return new Response(body, {
    headers: {
      "Content-Type": rendered.contentType,
      "Cache-Control":
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      ETag: etag,
      "X-Card": "scene",
      "X-Runtime": "nodejs",
      "X-Scene-Elements": String(parsed.data.elements.length),
    },
  });
}

async function renderAndRespond(
  rawSpec: unknown,
  format: CardFormat,
  request: Request,
  url: URL,
): Promise<Response> {
  const parsed = LayoutSpec.safeParse(rawSpec);
  if (!parsed.success) {
    return new Response(`Invalid LayoutSpec: ${parsed.error.message}`, {
      status: 400,
    });
  }

  let rendered;
  try {
    rendered = await renderCompound(
      parsed.data,
      format,
      `${url.protocol}//${url.host}`,
      url.searchParams,
    );
  } catch (e) {
    return new Response(`Render failed: ${errMessage(e)}`, { status: 500 });
  }

  const etag = await etagOf(rendered.body);
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control":
          "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  }

  const body =
    typeof rendered.body === "string"
      ? rendered.body
      : (rendered.body as BodyInit);

  return new Response(body, {
    headers: {
      "Content-Type": rendered.contentType,
      "Cache-Control":
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      ETag: etag,
      "X-Card": "compound",
      "X-Runtime": "nodejs",
      "X-Compound-Cards": String(parsed.data.cards.length),
    },
  });
}

// Standard base64url decode (URL-safe alphabet, no padding). Tolerates
// regular base64 as well so callers can use either.
function decodeBase64Url(s: string): Uint8Array {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
