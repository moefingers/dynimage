import type { CardFormat } from "@/lib/cards/types";

// Parse the /i/<id>[.ext] path segment into a published id + format.
// Published ids are base64url (genId): [A-Za-z0-9_-], never contain a dot,
// so the optional trailing `.svg|.png|.webp|.avif` is unambiguous. No
// extension → svg (the permanent embed default, spec §8).
const EMBED_RE = /^([A-Za-z0-9_-]+)(?:\.(svg|png|webp|avif))?$/;

export function parseEmbedPath(
  segment: string,
): { id: string; format: CardFormat } | null {
  const m = EMBED_RE.exec(segment);
  if (!m) return null;
  return { id: m[1]!, format: (m[2] ?? "svg") as CardFormat };
}
