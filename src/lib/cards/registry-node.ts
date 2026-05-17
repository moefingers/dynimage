import type { Card } from "./types";
import { portraitCard } from "./portrait";

// Node runtime registry. Cards needing native graphics (Skia via
// @napi-rs/canvas, Sharp). Imported by the Node catch-all route only.
const NODE_CARDS = {
  portrait: portraitCard,
} as const;

export type NodeCardName = keyof typeof NODE_CARDS;

export function getNodeCard(name: string): Card<unknown> | null {
  if (name in NODE_CARDS) {
    return NODE_CARDS[name as NodeCardName] as unknown as Card<unknown>;
  }
  return null;
}
