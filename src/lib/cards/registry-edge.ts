import type { AnyCard } from "./types";
import { commitsCard } from "./commits";
import { textCard } from "./text";
import { metricCard } from "./metric";
import { barCard } from "./bar";

// Edge runtime registry. ONLY imports cards declared as
// `runtime: "edge"`. The Edge bundle has size and dep restrictions
// (no native modules), so it must never transitively pull a Node-only
// card module like `streak` (sharp) or `portrait` (@napi-rs/canvas).
//
// Adding a new Edge card: create the module, add one line here.
const EDGE_CARDS = {
  commits: commitsCard,
  text: textCard,
  metric: metricCard,
  bar: barCard,
} as const;

export type EdgeCardName = keyof typeof EDGE_CARDS;

export function getEdgeCard(name: string): AnyCard | null {
  if (name in EDGE_CARDS) {
    // The cast is sound: each card declares its own TInput/TData, and
    // the dispatcher pairs Zod-validated input with the same card's
    // resolver and renderer. TS can't express this through invariant
    // generics without HKT, so we erase to AnyCard at the boundary.
    return EDGE_CARDS[name as EdgeCardName] as unknown as AnyCard;
  }
  return null;
}
