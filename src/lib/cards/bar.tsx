import { z } from "zod";
import { ImageResponse } from "next/og";
import type { Card, CardRenderer } from "./types";
import { esc } from "./svg-helpers";

const DEFAULT_W = 320;
const DEFAULT_H = 80;

// Bar card — literal value + literal max → proportion bar with label.
// Pure presentation, no upstream fetch. Designed for ratios like
// "47/60 commits authored" or "78% complete".
const Input = z.object({
  value: z.coerce.number().min(0),
  max: z.coerce.number().positive(),
  label: z.string().min(1).max(60).optional(),
  showValue: z.coerce.boolean().optional().default(true),
});
type Input = z.infer<typeof Input>;

type Data = Input;

const renderSvg: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const pad = 16;
  const labelH = data.label || data.showValue ? 22 : 0;
  const barH = Math.min(20, height - pad * 2 - labelH);
  const barY = pad + labelH;
  const barW = width - pad * 2;
  const fillW = Math.max(0, Math.min(1, data.value / data.max)) * barW;
  const valueText = data.showValue
    ? `${formatNum(data.value)} / ${formatNum(data.max)}`
    : "";
  return {
    contentType: "image/svg+xml; charset=utf-8",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`${data.label ?? "progress"}: ${valueText}`)}">
  <rect width="${width}" height="${height}" rx="14" ry="14" fill="${theme.bg}" stroke="${theme.stroke}" stroke-width="1"/>
  ${
    data.label
      ? `<text x="${pad}" y="${pad + 12}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" font-weight="500" fill="${theme.text}">${esc(data.label)}</text>`
      : ""
  }
  ${
    valueText
      ? `<text x="${width - pad}" y="${pad + 12}" text-anchor="end" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" font-weight="500" fill="${theme.textMuted}">${esc(valueText)}</text>`
      : ""
  }
  <rect x="${pad}" y="${barY}" width="${barW}" height="${barH}" rx="${barH / 2}" ry="${barH / 2}" fill="${theme.stroke}" opacity="0.5"/>
  <rect x="${pad}" y="${barY}" width="${fillW}" height="${barH}" rx="${barH / 2}" ry="${barH / 2}" fill="${theme.accent}"/>
</svg>`,
  };
};

const renderPng: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const ratio = Math.max(0, Math.min(1, data.value / data.max));
  const pct = Math.round(ratio * 100);
  const valueText = data.showValue
    ? `${formatNum(data.value)} / ${formatNum(data.max)}`
    : "";
  const img = new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "16px 16px",
        backgroundColor: theme.bg,
        border: `1px solid ${theme.stroke}`,
        borderRadius: 14,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: theme.text,
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        <span>{data.label ?? ""}</span>
        <span style={{ color: theme.textMuted }}>{valueText}</span>
      </div>
      <div
        style={{
          display: "flex",
          height: 20,
          backgroundColor: theme.stroke,
          borderRadius: 10,
          overflow: "hidden",
          marginTop: "auto",
          marginBottom: "auto",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: theme.accent,
          }}
        />
      </div>
    </div>,
    { width, height },
  );
  const arr = new Uint8Array(await img.arrayBuffer());
  return { body: arr, contentType: "image/png" };
};

function formatNum(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(1);
}

export const barCard: Card<Input, Data> = {
  name: "bar",
  runtime: "edge",
  defaultSize: { width: DEFAULT_W, height: DEFAULT_H },
  input: Input,
  resolve: async (input) => input,
  formats: { svg: renderSvg, png: renderPng },
  meta: {
    title: "Proportion bar",
    description:
      "Horizontal bar showing value / max ratio. No upstream fetch — caller supplies both numbers. Optional label and value display.",
    dimensions: ["none"],
    supportsAnimation: false,
  },
};
