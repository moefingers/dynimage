import { gunzipSync } from "node:zlib";
import { LayoutSpec } from "@/lib/cards/spec";
import { renderCompound } from "@/lib/cards/compound";
import { etagOf } from "@/lib/cards/etag";
import type { CardFormat } from "@/lib/cards/types";

// Compound-rendering endpoint. Two transports onto the same dispatcher:
//
//   GET /api/render?spec=<base64-of-JSON>&format=png
//     → camo-friendly, the URL IS the spec, fully cacheable.
//     Optional &z=1 indicates the spec is gzipped before base64.
//
//   POST /api/render?format=png
//     Body: { ...LayoutSpec... }
//     → server-to-server, used by callers like unlv-museum's sync
//       script that POST a spec and save the resulting bytes locally.
//
// Both paths share the same compound renderer. Runs on Node because
// compound's PNG/WebP/AVIF compositing uses sharp.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_FORMATS = new Set<CardFormat>(["svg", "png", "webp", "avif"]);

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "svg";
  const specParam = url.searchParams.get("spec");
  const gzipped = url.searchParams.get("z") === "1";

  if (!VALID_FORMATS.has(format as CardFormat)) {
    return new Response(
      `Invalid format "${format}". Supported: ${[...VALID_FORMATS].join(", ")}.`,
      { status: 400 },
    );
  }
  if (!specParam) {
    return new Response(
      "Missing required ?spec=<base64> parameter. Pass a LayoutSpec encoded as base64-JSON (or base64-gzipped-JSON with &z=1).",
      { status: 400 },
    );
  }

  let specJson: unknown;
  try {
    const raw = decodeBase64Url(specParam);
    const text = gzipped
      ? new TextDecoder().decode(gunzipSync(raw))
      : new TextDecoder().decode(raw);
    specJson = JSON.parse(text);
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

  return renderAndRespond(body, format as CardFormat, request, url);
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
