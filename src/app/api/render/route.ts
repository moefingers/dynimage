import { after } from "next/server";
import { inflateCapped, decodeConfig } from "@/lib/encode/codec";
import { LayoutSpec } from "@/lib/cards/spec";
import { renderCompound } from "@/lib/cards/compound";
import { Scene } from "@/lib/scene/scene-spec";
import { renderScene } from "@/lib/scene/render";
import { getPreset } from "@/lib/scene/presets";
import { sceneHasPrivilegedBind } from "@/lib/scene/bind";
import { etagOf } from "@/lib/cards/etag";
import { l1ReadThrough, l1Key, stableStringify } from "@/lib/data/l1cache";
import { meterRender } from "@/lib/data/usage";
import { redisConfigured } from "@/lib/data/redis";
import { DedupeCache } from "@/lib/data/cache";
import type { RenderContext } from "@/lib/data/seam";
import { auth } from "@/lib/auth/auth";
import type { CardFormat } from "@/lib/cards/types";

// Render endpoint. Two config shapes, four transports, one Node runtime
// (Skia/sharp compositing is Node-only):
//
//   Scene (scene/element model — §1/§2):
//     GET  /api/render?preset=<name>&user=<id>&format=png    (Tier-0)
//     GET  /api/render?scene=<base64url-of-JSON>&format=png  (&z=1 gzip)
//     GET  /api/render?c=<base64url(gzip(json))>&z=1         (Tier-2 blob)
//     POST /api/render?format=png   Body: { v:1, canvas, elements }
//   LayoutSpec (legacy compound — retained during transition):
//     GET  /api/render?spec=<base64-of-JSON>&format=png      (&z=1 gzip)
//     POST /api/render?format=png   Body: { v:1, w, h, cards }
//
// GET picks the path by which param is present; POST sniffs the body
// shape (`elements` ⇒ Scene, `cards` ⇒ LayoutSpec). All three Scene GET
// transports converge on the SAME respondWithL1/renderScene path, so they
// share L1 caching, the ETag/304, and (for ?scene=/?c=) the codec's
// decompression cap:
//   - ?preset= is Tier-0 — a named preset bundle built around ?user=,
//     the literal DoD embed (e.g. preset=commits-orbit&user=moefingers).
//   - ?c= is the Tier-2 compressed sibling of ?scene= (spec §2): the codec
//     unwraps its v:1 envelope to a Scene, inheriting the bomb ceiling.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_FORMATS = new Set<CardFormat>(["svg", "png", "webp", "avif"]);

const CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

// L1 freshness (spec §6: L1 TTL ≤ min L2 TTL of the config's binds). v1
// uses the L2 per-metric FLOOR (userContributions/streak = 15m, see
// data/atoms-seam.ts) as the ceiling for any data-dependent config; a
// config that touches no upstream data can cache far longer. Exact
// per-bind TTL is a later optimization.
const L1_TTL_DATA = 15 * 60_000;
const L1_TTL_STATIC = 6 * 60 * 60_000;

// Query params that select the config/transport rather than the
// PRESENTATION — excluded from the L1 key (config is hashed separately,
// format is its own key part). Everything else (theme, bg, accent, ?v=…)
// changes the rendered bytes, so it folds into the key.
const TRANSPORT_PARAMS = new Set(["c", "scene", "spec", "z", "format"]);

function presentationKey(url: URL): string {
  const entries = [...url.searchParams.entries()]
    .filter(([k]) => !TRANSPORT_PARAMS.has(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return new URLSearchParams(entries).toString();
}

// A scene depends on upstream data only if some element binds to a real
// provider; a `literal` bind carries its value inline (no fetch).
function sceneIsDataDependent(scene: Scene): boolean {
  return scene.elements.some(
    (el) => el.bind != null && el.bind.provider !== "literal",
  );
}

// Resolve the rendering OWNER (spec §5). Editor preview / authenticated
// callers carry a Better Auth session → owner-from-session. (Embed
// owner-from-published-id arrives with the /i/<id> route in Phase C.)
// NEVER blocks a render on auth: if session resolution fails, treat the
// request as anonymous (the public front line must stay good).
async function resolveOwner(
  request: Request,
): Promise<{ userId: string } | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user?.id ? { userId: session.user.id } : null;
  } catch {
    return null;
  }
}

// Shared L1 read-through + response. A cache hit returns stored bytes with
// NO render and NO render-meter tick; a miss renders, caches, and meters
// (attributed to `ownerId` — the per-owner abuse meter, spec §7).
// Degrades to a direct render when Upstash is unconfigured (X-L1: bypass).
async function respondWithL1(args: {
  keyParts: readonly string[];
  ttlMs: number;
  ownerId: string | null;
  request: Request;
  doRender: () => Promise<{ body: string | Uint8Array; contentType: string }>;
  headers: Record<string, string>;
}): Promise<Response> {
  let result;
  try {
    result = await l1ReadThrough(
      await l1Key(args.keyParts),
      args.ttlMs,
      async () => {
        const rendered = await args.doRender();
        return {
          body: rendered.body,
          contentType: rendered.contentType,
          etag: await etagOf(rendered.body),
        };
      },
    );
  } catch (e) {
    return new Response(`Render failed: ${errMessage(e)}`, { status: 500 });
  }

  const { render: out, hit } = result;
  if (!hit && redisConfigured()) {
    // Meter the compute (abuse meter) — attributed to the owner when known,
    // else the anonymous shared bucket. Per-render, on MISS only (an L1 hit
    // cost no compute). Embeds meter per published-URL/owner, never per IP
    // (camo hides viewers — spec §7).
    await meterRender({ ownerId: args.ownerId }).catch(() => {});
  }
  const xL1 = redisConfigured() ? (hit ? "hit" : "miss") : "bypass";

  const ifNoneMatch = args.request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === out.etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: out.etag, "Cache-Control": CACHE_CONTROL, "X-L1": xL1 },
    });
  }

  const body = typeof out.body === "string" ? out.body : (out.body as BodyInit);
  return new Response(body, {
    headers: {
      "Content-Type": out.contentType,
      "Cache-Control": CACHE_CONTROL,
      ETag: out.etag,
      "X-L1": xL1,
      ...args.headers,
    },
  });
}

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
  const presetParam = url.searchParams.get("preset");
  const cParam = url.searchParams.get("c");
  const sceneParam = url.searchParams.get("scene");
  const specParam = url.searchParams.get("spec");
  const gzipped = url.searchParams.get("z") === "1";

  if (!VALID_FORMATS.has(format as CardFormat)) {
    return new Response(
      `Invalid format "${format}". Supported: ${[...VALID_FORMATS].join(", ")}.`,
      { status: 400 },
    );
  }
  if (!presetParam && !cParam && !sceneParam && !specParam) {
    return new Response(
      "Missing config. Pass ?preset=<name>&user=<id> (Tier-0), ?c=<base64url(gzip(json))> (Tier-2 blob), ?scene=<base64url(JSON)> (scene/element model), or ?spec=<base64(JSON)> (legacy compound); add &z=1 if gzipped.",
      { status: 400 },
    );
  }

  // ?preset= — Tier-0. A named preset bundle built around a subject. The
  // preset's build() returns a Scene, which then takes the exact same
  // respondWithL1/renderScene path as ?scene= (inheriting L1 + etag).
  if (presetParam) {
    const user = url.searchParams.get("user");
    if (!user) {
      return new Response(
        `?preset=${presetParam} requires ?user=<id> (the subject to render).`,
        { status: 400 },
      );
    }
    const preset = getPreset(presetParam);
    if (!preset) {
      return new Response(`Unknown preset "${presetParam}".`, { status: 404 });
    }
    if (!preset.subjectKinds.includes("user")) {
      return new Response(
        `Preset "${presetParam}" does not accept a user subject (accepts: ${preset.subjectKinds.join(", ")}).`,
        { status: 400 },
      );
    }
    const theme = url.searchParams.get("theme") ?? undefined;
    const scene = preset.build({ subject: { kind: "user", id: user }, theme });
    return renderSceneAndRespond(scene, format as CardFormat, request, url);
  }

  // ?c= — Tier-2 compressed blob. The codec unwraps its v:1 envelope (and
  // enforces the decompression cap) to a Scene config, which then takes the
  // exact same path as the raw ?scene= transport.
  if (cParam) {
    let sceneJson: unknown;
    try {
      sceneJson = await decodeConfig(cParam, gzipped);
    } catch (e) {
      return new Response(`Failed to decode c= blob: ${errMessage(e)}`, {
        status: 400,
      });
    }
    return renderSceneAndRespond(sceneJson, format as CardFormat, request, url);
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

  const scene = parsed.data;
  const owner = await resolveOwner(request);

  // RenderContext threads owner + per-render L1 + SWR hook into the seam.
  const ctx: RenderContext = {
    owner,
    l1: new DedupeCache(),
    waitUntil: (p) => after(p),
  };

  // L1 render-output owner-namespacing (mirrors the L2 §6/§14.5 invariant
  // one layer up): a privileged scene (private / vantage-sensitive bind)
  // rendered by an OWNER can embed their private data, so its bytes must
  // NOT be served to a public embedder. Key by owner in that case; a public
  // scene (or anonymous render) keeps the shared key. Anonymous always reads
  // the public key → the public-only render, regardless.
  const ownerNs =
    owner && sceneHasPrivilegedBind(scene) ? `owner:${owner.userId}` : "public";

  return respondWithL1({
    keyParts: [
      "scene",
      format,
      stableStringify(scene),
      presentationKey(url),
      ownerNs,
    ],
    ttlMs: sceneIsDataDependent(scene) ? L1_TTL_DATA : L1_TTL_STATIC,
    ownerId: owner?.userId ?? null,
    request,
    doRender: () =>
      renderScene(
        scene,
        format,
        `${url.protocol}//${url.host}`,
        url.searchParams,
        ctx,
      ),
    headers: {
      "X-Card": "scene",
      "X-Runtime": "nodejs",
      "X-Scene-Elements": String(scene.elements.length),
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

  const spec = parsed.data;
  return respondWithL1({
    keyParts: ["compound", format, stableStringify(spec), presentationKey(url)],
    // Legacy compound cards fetch upstream via their own resolvers; without
    // per-card data introspection, cap L1 at the L2 data floor.
    ttlMs: L1_TTL_DATA,
    // Legacy compound path stays anonymous (public front line); it doesn't
    // flow through the owner-aware seam.
    ownerId: null,
    request,
    doRender: () =>
      renderCompound(
        spec,
        format,
        `${url.protocol}//${url.host}`,
        url.searchParams,
      ),
    headers: {
      "X-Card": "compound",
      "X-Runtime": "nodejs",
      "X-Compound-Cards": String(spec.cards.length),
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
