import type { Card, CardFormat } from "./types";
import { resolveTheme } from "./theme";
import { etagOf } from "./etag";

const STAT_RE = /^([a-z][a-z0-9-]*)\.(svg|png|webp|avif)$/i;

export type DispatchInput = {
  user: string;
  statSegment: string;
  searchParams: URLSearchParams;
  runtime: "edge" | "nodejs";
  ifNoneMatch: string | null;
  baseUrl: string;
  getCard: (name: string) => Card<unknown> | null;
};

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
    // Reachable if next.config rewrites are out of sync with the registry.
    // Loud failure beats silent misroute.
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

  const sp = input.searchParams;
  const width =
    parseIntOr(sp.get("w"), card.defaultSize.width) ?? card.defaultSize.width;
  const height =
    parseIntOr(sp.get("h"), card.defaultSize.height) ?? card.defaultSize.height;
  const theme = resolveTheme(sp);

  let data: unknown;
  try {
    data = await card.fetch(input.user, { searchParams: sp });
  } catch (e) {
    return new Response(`Upstream fetch failed: ${errMessage(e)}`, {
      status: 502,
    });
  }

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
      : // Coerce Uint8Array to BodyInit; Response accepts it via BufferSource.
        (rendered.body as BodyInit);

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
