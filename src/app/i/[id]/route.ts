import { after } from "next/server";
import { Scene } from "@/lib/scene/scene-spec";
import { getPublishedEmbed } from "@/lib/publish/store";
import { renderEmbed } from "@/lib/publish/render-embed";
import { parseEmbedPath } from "@/lib/publish/path";

// ─────────────────────────────────────────────────────────────────────
// Permanent embed endpoint (spec §8). GET /i/<id>[.ext] → resolve the
// published config → render via the SAME renderScene + L1 path → return
// ONLY the image bytes. NEVER the config JSON.
//
// Possession of the unguessable id IS the authorization: the embed is
// public (camo fetches it anonymously) but renders with the PUBLISHER's
// vantage (owner-from-id), so a consented private bind resolves with their
// token and the L1/L2 caches stay owner-namespaced (no cross-owner leak).
//
//   ?theme=  presentation override (the <picture> light/dark split)
//   ?v=      transient force-refresh — forces an L1 re-render, but the L2
//            TTL floor still governs upstream, and stale-if-error serves
//            cached bytes on a dead PAT (both inherited from the seam/L2).
//   ?cb=     camo cache-bust; ignored here (identical bytes, same L1 entry).
// ─────────────────────────────────────────────────────────────────────
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: segment } = await params;
  const parsed = parseEmbedPath(segment);
  if (!parsed) {
    return new Response("Bad embed id.", { status: 400 });
  }
  const { id, format } = parsed;

  const row = await getPublishedEmbed(id);
  // 404 for missing OR disabled (moderation §11). Identical response so a
  // disabled id is indistinguishable from a never-existed one.
  if (!row || row.disabled) {
    return new Response("Embed not found.", { status: 404 });
  }

  // The config was validated at publish time; re-validate defensively. A
  // failure here is a 500 (our data), never a config leak.
  const scene = Scene.safeParse(row.config);
  if (!scene.success) {
    return new Response("Embed configuration is invalid.", { status: 500 });
  }

  const url = new URL(request.url);
  const theme = url.searchParams.get("theme");
  const v = url.searchParams.get("v");

  let out;
  try {
    out = await renderEmbed({
      id,
      scene: scene.data,
      ownerId: row.ownerId,
      format,
      theme,
      v,
      baseUrl: `${url.protocol}//${url.host}`,
      waitUntil: (p) => after(p),
    });
  } catch (e) {
    return new Response(`Render failed: ${errMessage(e)}`, { status: 500 });
  }

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === out.etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: out.etag, "Cache-Control": CACHE_CONTROL },
    });
  }

  const body = typeof out.body === "string" ? out.body : (out.body as BodyInit);
  return new Response(body, {
    headers: {
      "Content-Type": out.contentType,
      "Cache-Control": CACHE_CONTROL,
      ETag: out.etag,
      "X-L1": out.hit ? "hit" : "miss",
      "X-Embed": id,
    },
  });
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
