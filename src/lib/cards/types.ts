import type { z } from "zod";
import type { DedupeCache } from "@/lib/data/cache";

export type CardFormat = "svg" | "png" | "webp" | "avif";

export type Theme = {
  name: string;
  bg: string;
  accent: string;
  text: string;
  textMuted: string;
  gradient: string;
  stroke: string;
};

// Dimensions a card type accepts. Used by the editor introspection
// endpoint to show users "this card needs a GitHub user", "this one
// needs a user + repo", etc. Cards may accept more than one (e.g. a
// repo card implicitly needs the user too).
export type CardDimension = "user" | "repo" | "topic" | "contributor" | "none"; // for cards with no upstream data (e.g. text)

// Static metadata about a card, surfaced via /api/meta for the editor.
// Lives on the Card itself; never duplicated in a separate registry.
export type CardMeta = {
  title: string;
  description: string;
  dimensions: ReadonlyArray<CardDimension>;
  supportsAnimation: boolean;
};

export type CardRenderInput<TData> = {
  data: TData;
  theme: Theme;
  width: number;
  height: number;
  baseUrl: string;
};

export type RenderedCard = {
  body: string | Uint8Array;
  contentType: string;
};

export type CardRenderer<TData> = (
  input: CardRenderInput<TData>,
) => Promise<RenderedCard>;

// The card abstraction. TInput is what the URL parses into (typed via
// the Zod schema); TData is what the resolver returns (whatever shape
// the renderer needs). Both are recovered from the Zod schema at
// register time, so adding a card means one Card<TInput, TData>
// declaration and TypeScript infers everything downstream.
export type Card<TInput = unknown, TData = unknown> = {
  name: string;
  runtime: "edge" | "nodejs";
  defaultSize: { width: number; height: number };
  input: z.ZodType<TInput>;
  resolve: (input: TInput, cache?: DedupeCache) => Promise<TData>;
  formats: Partial<Record<CardFormat, CardRenderer<TData>>>;
  meta: CardMeta;
};

// Convenience for module exports: lets a card file declare its module
// type cleanly. e.g. `export const commitsCard: AnyCard = { ... }`
export type AnyCard = Card<unknown, unknown>;
