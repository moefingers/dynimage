import type { Card } from "./types";
import { commitsCard } from "./commits";

// Edge runtime registry. Pulls in only cards whose dependencies are
// Edge-compatible (web-fetch only). Imported by the Edge catch-all
// route exclusively.
const EDGE_CARDS = {
  commits: commitsCard,
} as const;

export type EdgeCardName = keyof typeof EDGE_CARDS;

export function getEdgeCard(name: string): Card<unknown> | null {
  if (name in EDGE_CARDS) {
    // Variance erasure: each Card<TData> is invariant in TData, but at
    // runtime dispatch always pairs a fetcher and renderer with matching
    // data, so the cast is sound.
    return EDGE_CARDS[name as EdgeCardName] as unknown as Card<unknown>;
  }
  return null;
}
