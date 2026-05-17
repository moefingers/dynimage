import type { CardFormat } from "./types";

// Static metadata for every card. Imported by UI/docs code that must
// not transitively pull in card modules (which carry runtime-specific
// native deps). When adding a card, register it here AND in the
// runtime-specific registry below.
export const ALL_CARDS: ReadonlyArray<{
  name: string;
  runtime: "edge" | "nodejs";
  formats: readonly CardFormat[];
}> = [
  { name: "commits", runtime: "edge", formats: ["svg", "png"] },
  { name: "streak", runtime: "nodejs", formats: ["svg", "png"] },
  { name: "portrait", runtime: "nodejs", formats: ["png", "webp", "avif"] },
];
