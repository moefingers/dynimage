import type { AnyCard } from "./types";
import { commitsCard } from "./commits";
import { streakCard } from "./streak";
import { portraitCard } from "./portrait";
import { textCard } from "./text";
import { metricCard } from "./metric";
import { barCard } from "./bar";
import { orbitCard } from "./orbit";
import { typingCard } from "./typing";
import { syndicateCard } from "./syndicate";
import { heroCard } from "./hero";
import { stripCard } from "./strip";
import { prismCard } from "./prism";
import { nucleusCard } from "./nucleus";

// All-cards registry. Imports every card module — including the
// Node-only ones (sharp, @napi-rs/canvas). Used by:
//   - the Node catch-all route (for rendering Node cards)
//   - the /api/meta introspection endpoint (for editor metadata)
//   - compound rendering (any sub-card type is resolvable here)
//
// Never imported by Edge routes — those use registry-edge.ts.
const ALL_CARDS = {
  commits: commitsCard,
  streak: streakCard,
  portrait: portraitCard,
  text: textCard,
  metric: metricCard,
  bar: barCard,
  orbit: orbitCard,
  typing: typingCard,
  syndicate: syndicateCard,
  hero: heroCard,
  strip: stripCard,
  prism: prismCard,
  nucleus: nucleusCard,
} as const;

export type CardName = keyof typeof ALL_CARDS;

export function getCard(name: string): AnyCard | null {
  if (name in ALL_CARDS) {
    return ALL_CARDS[name as CardName] as unknown as AnyCard;
  }
  return null;
}

export function allCards(): ReadonlyArray<AnyCard> {
  return Object.values(ALL_CARDS) as unknown as AnyCard[];
}
