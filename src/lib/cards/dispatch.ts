import type { AnyCard, CardFormat } from "./types";
import { resolveTheme } from "./theme";
import { etagOf } from "./etag";
import { DedupeCache } from "@/lib/data/cache";

const STAT_RE = /^([a-z][a-z0-9-]*)\.(svg|png|webp|avif)$/i;

export type DispatchInput = {
  statSegment: string;
  searchParams: URLSearchParams;
  pathParams: Record<string, string>;
  runtime: "edge" | "nodejs";
  ifNoneMatch: string | null;
  baseUrl: string;
  getCard: (name: string) => AnyCard | null;
};

// Dispatch a request to the right card. The flow is:
//   1. Parse <stat>.<ext> into (cardName, format)
//   2. Look up the card; refuse if wrong runtime (loud failure, not silent)
//   3. Build the card's input object from pathParams + searchParams
//   4. Validate via the card's Zod schema (rejection here = clear 400)
//   5. Resolve data via the card's resolver (one DedupeCache per request)
//   6. Render via the card's renderer for the requested format
//   7. Hash → ETag → 304 if If-None-Match matches; else 200 with the body
//
// All validation is at the boundary; downstream code sees typed data.
export async function dispatchCard(input: DispatchInput): Promise<Response> {
  const match = STAT_RE.exec(input.statSegment);
  if (!match) {
    return new Response(
      "Bad stat segment. Expected <card>.<svg|png|webp|avif>.",
      { status: 400 },
    );
  }
  const cardName = match[1]!.toLowerCase();
  const format = match[2]!.toLowerCase() as CardFormat;

  const card = input.getCard(cardName);
  if (!card) {
    return new Response(`Unknown card "${cardName}".`, { status: 404 });
  }

  if (card.runtime !== input.runtime) {
    // Reachable if next.config rewrites are out of sync with the
    // registry. Loud failure beats silent misroute.
    return new Response(
      `Card "${cardName}" requires the ${card.runtime} runtime; got ${input.runtime}. ` +
        "Check next.config.ts rewrites.",
      { status: 500 },
    );
  }

  const renderer = card.formats[format];
  if (!renderer) {
    const supported = Object.keys(card.formats).join(", ");
    return new Response(
      `Card "${cardName}" does not support .${format}. Supported: ${supported}.`,
      { status: 404 },
    );
  }

  // Build the card's input object from URL path + query params. The
  // card's Zod schema picks the fields it needs and rejects anything
  // that fails validation. Query-string-only "cross-cutting" params
  // (theme, w, h, color overrides) are NOT in the card input — they're
  // resolved separately so all cards share consistent presentation.
  const inputObj: Record<string, string> = { ...input.pathParams };
  for (const [k, v] of input.searchParams.entries()) {
    // First write wins so explicit path params can't be overridden by
    // sneaky query strings. (Defense in depth — path params arrive
    // first anyway, but this makes the precedence explicit.)
    if (!(k in inputObj)) inputObj[k] = v;
  }

  const parsed = card.input.safeParse(inputObj);
  if (!parsed.success) {
    return new Response(
      `Invalid input for "${cardName}": ${parsed.error.message}`,
      { status: 400 },
    );
  }

  const cache = new DedupeCache();
  let data: unknown;
  try {
    data = await card.resolve(parsed.data, cache);
  } catch (e) {
    return new Response(`Upstream fetch failed: ${errMessage(e)}`, {
      status: 502,
    });
  }

  const width =
    parseIntOr(input.searchParams.get("w"), card.defaultSize.width) ??
    card.defaultSize.width;
  const height =
    parseIntOr(input.searchParams.get("h"), card.defaultSize.height) ??
    card.defaultSize.height;
  const theme = resolveTheme(input.searchParams);

  let rendered;
  try {
    rendered = await renderer({
      data,
      theme,
      width,
      height,
      baseUrl: input.baseUrl,
    });
  } catch (e) {
    return new Response(`Render failed: ${errMessage(e)}`, { status: 500 });
  }

  const etag = await etagOf(rendered.body);
  if (input.ifNoneMatch && input.ifNoneMatch === etag) {
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
      "X-Card": cardName,
      "X-Runtime": input.runtime,
    },
  });
}

function parseIntOr(raw: string | null, fallback: number): number | null {
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 4096) return fallback;
  return n;
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
