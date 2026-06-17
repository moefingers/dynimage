import type { Scene } from "@/lib/scene/scene-spec";
import { renderScene } from "@/lib/scene/render";
import { etagOf } from "@/lib/cards/etag";
import { l1ReadThrough, l1Key } from "@/lib/data/l1cache";
import { meterRender } from "@/lib/data/usage";
import { redisConfigured } from "@/lib/data/redis";
import { DedupeCache } from "@/lib/data/cache";
import type { RenderContext } from "@/lib/data/seam";
import type { CardFormat } from "@/lib/cards/types";

// ─────────────────────────────────────────────────────────────────────
// Render a published embed by id, through the SAME renderScene + L1 path
// as /api/render. Shared by BOTH the /i/<id> route and publish pre-warm,
// so they compute the IDENTICAL L1 key — that's what makes camo hit #1
// instant (pre-warm populates the exact entry the first fetch reads).
// ─────────────────────────────────────────────────────────────────────

// L1 freshness mirrors /api/render: data-dependent configs cap at the L2
// per-metric floor (15m); a config with no upstream bind caches long.
const L1_TTL_DATA = 15 * 60_000;
const L1_TTL_STATIC = 6 * 60 * 60_000;

function sceneIsDataDependent(scene: Scene): boolean {
  return scene.elements.some(
    (el) => el.bind != null && el.bind.provider !== "literal",
  );
}

export type EmbedRender = {
  body: string | Uint8Array;
  contentType: string;
  etag: string;
  hit: boolean;
};

export type RenderEmbedArgs = {
  id: string;
  scene: Scene;
  /** the PUBLISHER — the embed renders with their vantage (spec §6), so a
   *  consented private bind resolves with their token and the L1/L2 caches
   *  stay owner-namespaced. */
  ownerId: string;
  format: CardFormat;
  /** presentation theme override (the <picture> light/dark split). */
  theme?: string | null;
  /** transient force-refresh (?v=): folded into the L1 key so it forces a
   *  re-render, but NOT into the render itself (bytes are identical). The
   *  L2 floor still governs upstream, so ?v= can't hammer GitHub. */
  v?: string | null;
  baseUrl: string;
  waitUntil?: (p: Promise<unknown>) => void;
};

export async function renderEmbed(args: RenderEmbedArgs): Promise<EmbedRender> {
  const { id, scene, ownerId, format, theme, v, baseUrl, waitUntil } = args;

  // Cache-bust (?cb=) is deliberately NOT in the key — it busts camo (L0)
  // on re-publish but produces identical bytes, so it must hit the same L1
  // entry pre-warm populated. theme + v DO change the key.
  const key = await l1Key(["embed", id, format, theme ?? "", v ?? ""]);
  const ttlMs = sceneIsDataDependent(scene) ? L1_TTL_DATA : L1_TTL_STATIC;

  const overrides = new URLSearchParams();
  if (theme) overrides.set("theme", theme);

  const ctx: RenderContext = {
    owner: { userId: ownerId },
    l1: new DedupeCache(),
    waitUntil,
  };

  const { render, hit } = await l1ReadThrough(key, ttlMs, async () => {
    const r = await renderScene(scene, format, baseUrl, overrides, ctx);
    return {
      body: r.body,
      contentType: r.contentType,
      etag: await etagOf(r.body),
    };
  });

  // Meter the compute on a MISS only, attributed to the publisher (embeds
  // meter per published-URL/owner, never per viewer — camo hides them).
  if (!hit && redisConfigured()) {
    await meterRender({ ownerId }).catch(() => {});
  }

  return { ...render, hit };
}
