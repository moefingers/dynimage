import { z } from "zod";
import { ImageResponse } from "next/og";
import type { Card, CardRenderer } from "./types";
import { esc } from "./svg-helpers";

const DEFAULT_W = 320;
const DEFAULT_H = 80;

// Text card — pure user input, no upstream fetch. Proof that the
// architecture handles fetch-less cards via an identity resolver.
// Useful for titles, labels, section headers in compound layouts.
const Input = z.object({
  text: z.string().min(1).max(200),
  size: z.coerce.number().int().min(8).max(200).optional().default(32),
  weight: z.enum(["normal", "bold"]).optional().default("bold"),
  align: z.enum(["left", "center", "right"]).optional().default("center"),
});
type Input = z.infer<typeof Input>;

type Data = Input;

const renderSvg: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const x =
    data.align === "left"
      ? 16
      : data.align === "right"
        ? width - 16
        : width / 2;
  const anchor =
    data.align === "left" ? "start" : data.align === "right" ? "end" : "middle";
  const fontWeight = data.weight === "bold" ? 700 : 400;
  return {
    contentType: "image/svg+xml; charset=utf-8",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(data.text)}">
  <rect width="${width}" height="${height}" rx="14" ry="14" fill="${theme.bg}" stroke="${theme.stroke}" stroke-width="1"/>
  <text x="${x}" y="${height / 2}" text-anchor="${anchor}" dominant-baseline="middle"
        font-family="ui-sans-serif, system-ui, sans-serif"
        font-size="${data.size}" font-weight="${fontWeight}"
        fill="${theme.text}">${esc(data.text)}</text>
</svg>`,
  };
};

const renderPng: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const justify =
    data.align === "left"
      ? "flex-start"
      : data.align === "right"
        ? "flex-end"
        : "center";
  const img = new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: justify,
        padding: "0 16px",
        backgroundColor: theme.bg,
        border: `1px solid ${theme.stroke}`,
        borderRadius: 14,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: data.size,
          fontWeight: data.weight === "bold" ? 700 : 400,
          color: theme.text,
        }}
      >
        {data.text}
      </div>
    </div>,
    { width, height },
  );
  const arr = new Uint8Array(await img.arrayBuffer());
  return { body: arr, contentType: "image/png" };
};

export const textCard: Card<Input, Data> = {
  name: "text",
  runtime: "edge",
  defaultSize: { width: DEFAULT_W, height: DEFAULT_H },
  input: Input,
  resolve: async (input) => input, // identity — no upstream fetch
  formats: {
    svg: renderSvg,
    png: renderPng,
  },
  meta: {
    title: "Text",
    description:
      "Static text label — title, section header, version badge, whatever. No upstream data fetch; the input IS the data. First-class proof that the card abstraction handles fetchless visuals.",
    dimensions: ["none"],
    supportsAnimation: false,
  },
};
