import { Scene } from "@/lib/scene/scene-spec";
import { sceneHasPrivilegedBind } from "@/lib/scene/bind";
import { genId } from "@/lib/id";
import { insertPublishedEmbed } from "./store";
import { renderEmbed } from "./render-embed";
import { buildSnippet } from "./snippet";

// ─────────────────────────────────────────────────────────────────────
// Publish action (spec §8) — TRANSACTIONAL + pre-warm.
//
// LIBRARY FUNCTION ONLY. The sole caller is deputy's gated publish action
// (session + email-verified + entitlements). Never expose this as a route
// or unguarded server action — that's the one-insert-path guard.
//
// Flow: validate Scene → allocate an unguessable id (collision-retry) →
// INSERT (config saved) → pre-warm L1+L2 for every snippet theme variant →
// return {id, url, snippet}. The id resolves only after the row is
// committed AND the eager render warms the cache, so camo hit #1 is
// instant ("no broken embed, ever" — funnel §8.4).
// ─────────────────────────────────────────────────────────────────────

export class PublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishError";
  }
}

export type PublishArgs = {
  config: unknown;
  /** the publisher (already authenticated by deputy's gate). */
  ownerId: string;
  /** absolute origin for the returned url + snippet + pre-warm baseUrl. */
  baseUrl: string;
  href?: string;
  alt?: string;
  /** Vercel after()/waitUntil hook for the seam's SWR (optional). */
  waitUntil?: (p: Promise<unknown>) => void;
};

export type PublishResult = {
  id: string;
  url: string;
  snippet: string;
  exposesPrivateData: boolean;
};

const ID_RETRIES = 4;

export async function publishEmbed(args: PublishArgs): Promise<PublishResult> {
  const parsed = Scene.safeParse(args.config);
  if (!parsed.success) {
    throw new PublishError(`Invalid scene config: ${parsed.error.message}`);
  }
  const scene = parsed.data;

  // SINGLE SOURCE OF TRUTH — computed here, never caller-supplied.
  const exposesPrivateData = sceneHasPrivilegedBind(scene);

  // Allocate an unguessable id; retry on the (astronomically unlikely)
  // 128-bit collision. The insert is atomic (onConflictDoNothing).
  let id = "";
  for (let attempt = 0; attempt < ID_RETRIES; attempt++) {
    const candidate = genId();
    const ok = await insertPublishedEmbed({
      id: candidate,
      ownerId: args.ownerId,
      config: scene,
      exposesPrivateData,
    });
    if (ok) {
      id = candidate;
      break;
    }
  }
  if (!id) {
    throw new PublishError("Could not allocate a unique embed id.");
  }

  // Pre-warm BEFORE the url is handed back, for the single variant the
  // snippet emits — the bare /i/<id>.svg (no theme), which renders the
  // config's baked canvas.theme. Best-effort: a warm failure must not fail
  // publish — the row is committed, so the embed resolves; hit #1 just
  // renders on demand instead of from cache. (The per-(id,theme) machinery
  // still covers ?theme= overrides; they warm lazily on first request.)
  await renderEmbed({
    id,
    scene,
    ownerId: args.ownerId,
    format: "svg",
    theme: null,
    baseUrl: args.baseUrl,
    waitUntil: args.waitUntil,
  }).catch(() => {});

  // Stable per-publish cache-bust (base36 epoch). Re-publishing/editing
  // produces a new cb so camo refreshes; it is NOT the transient ?v=.
  const cb = Date.now().toString(36);
  const url = `${args.baseUrl}/i/${id}.svg`;
  const snippet = buildSnippet({
    id,
    baseUrl: args.baseUrl,
    href: args.href,
    alt: args.alt,
    cb,
  });

  return { id, url, snippet, exposesPrivateData };
}
