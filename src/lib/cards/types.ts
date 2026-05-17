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

export type CardFetchInput = {
  searchParams: URLSearchParams;
};

export type Card<TData = unknown> = {
  name: string;
  runtime: "edge" | "nodejs";
  fetch: (user: string, input: CardFetchInput) => Promise<TData>;
  formats: Partial<Record<CardFormat, CardRenderer<TData>>>;
  defaultSize: { width: number; height: number };
};
