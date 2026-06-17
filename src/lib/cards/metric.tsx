import { z } from "zod";
import { ImageResponse } from "next/og";
import type { Card, CardRenderer } from "./types";
import { esc, fmtInt } from "./svg-helpers";

const DEFAULT_W = 280;
const DEFAULT_H = 140;

// Metric card — literal label + value + optional unit. Pure presentation,
// no upstream fetch. Designed for callers who precompute their numbers
// (e.g. unlv-museum's sync script) and just want dynimage to render them
// with consistent typography.
const Input = z.object({
  label: z.string().min(1).max(40),
  value: z.string().min(1).max(40),
  unit: z.string().max(10).optional(),
  size: z.coerce.number().int().min(8).max(200).optional().default(64),
});
type Input = z.infer<typeof Input>;

type Data = Input;

// Single-sourced label tracking shared by both renderers (Stab #5: cross-
// format parity). Expressed em-relative; the SVG path uses it directly and
// the Satori path multiplies by the label font size to get pixels, so the
// two no longer drift (SVG was 0.08em, Satori a fixed 1.5px).
const LABEL_LETTER_SPACING_EM = 0.08;

const renderSvg: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const cx = width / 2;
  const valueY = height * 0.5;
  const labelY = height * 0.78;
  return {
    contentType: "image/svg+xml; charset=utf-8",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`${data.label}: ${data.value}${data.unit ?? ""}`)}">
  <rect width="${width}" height="${height}" rx="14" ry="14" fill="${theme.bg}" stroke="${theme.stroke}" stroke-width="1"/>
  <text x="${cx}" y="${valueY}" text-anchor="middle" dominant-baseline="middle"
        font-family="ui-sans-serif, system-ui, sans-serif"
        font-size="${data.size}" font-weight="700"
        fill="${theme.accent}">${esc(formatValue(data.value))}${data.unit ? `<tspan font-size="${Math.round(data.size * 0.5)}" font-weight="500" fill="${theme.textMuted}"> ${esc(data.unit)}</tspan>` : ""}</text>
  <text x="${cx}" y="${labelY}" text-anchor="middle" dominant-baseline="middle"
        font-family="ui-sans-serif, system-ui, sans-serif"
        font-size="${Math.round(data.size * 0.25)}" font-weight="500"
        fill="${theme.textMuted}"
        text-transform="uppercase" letter-spacing="${LABEL_LETTER_SPACING_EM}em">${esc(data.label.toUpperCase())}</text>
</svg>`,
  };
};

const renderPng: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const img = new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        backgroundColor: theme.bg,
        border: `1px solid ${theme.stroke}`,
        borderRadius: 14,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          color: theme.accent,
          fontSize: data.size,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        <span>{formatValue(data.value)}</span>
        {data.unit ? (
          <span
            style={{
              fontSize: Math.round(data.size * 0.5),
              fontWeight: 500,
              color: theme.textMuted,
            }}
          >
            {data.unit}
          </span>
        ) : null}
      </div>
      <div
        style={{
          fontSize: Math.round(data.size * 0.25),
          fontWeight: 500,
          color: theme.textMuted,
          textTransform: "uppercase",
          letterSpacing: Math.round(data.size * 0.25) * LABEL_LETTER_SPACING_EM,
        }}
      >
        {data.label}
      </div>
    </div>,
    { width, height },
  );
  const arr = new Uint8Array(await img.arrayBuffer());
  return { body: arr, contentType: "image/png" };
};

// Try to format the value as a thousands-separated integer if it parses;
// otherwise pass through as-is so callers can supply pre-formatted text
// like "47/60" or "98.5%".
function formatValue(raw: string): string {
  const n = Number(raw);
  if (Number.isFinite(n) && Number.isInteger(n) && raw === String(n)) {
    return fmtInt(n);
  }
  return raw;
}

export const metricCard: Card<Input, Data> = {
  name: "metric",
  runtime: "edge",
  defaultSize: { width: DEFAULT_W, height: DEFAULT_H },
  input: Input,
  resolve: async (input) => input,
  formats: { svg: renderSvg, png: renderPng },
  meta: {
    title: "Metric",
    description:
      "Literal value + label + optional unit, rendered with consistent metric typography. No upstream fetch — for callers that precompute their numbers.",
    dimensions: ["none"],
    supportsAnimation: false,
  },
};
