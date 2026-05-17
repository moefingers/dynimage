import { z } from "zod";
import { ImageResponse } from "next/og";
import type { Card, CardRenderer } from "./types";
import {
  userOverview,
  userContributions,
  type UserOverview,
  type UserContributions,
} from "@/lib/data/atoms";
import { esc, fmtInt } from "./svg-helpers";

const DEFAULT_W = 480;
const DEFAULT_H = 200;

// Zod input schema — single source of truth for what URL params this
// card accepts. The dispatcher validates input against this; the editor
// introspects it to render a form; TS infers TInput from `z.infer<…>`.
const Input = z.object({
  user: z
    .string()
    .min(1)
    .max(39)
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/),
});
type Input = z.infer<typeof Input>;

type Data = {
  overview: UserOverview;
  contrib: UserContributions;
};

// ── SVG renderer ──────────────────────────────────────────────────────
// Animated count-up (SMIL <animate> on text content), radial gradient
// background, and per-prefers-color-scheme theming when the request
// uses the default theme. Animations and CSS keep working under
// GitHub's camo proxy — only <script> is stripped.
const renderSvg: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const total = data.contrib.totalCommitsLastYear;
  const label = "commits in the last year";
  const sub = `${data.overview.name ?? data.overview.login} • ${fmtInt(data.overview.publicRepoCount)} public repos`;

  // SMIL count-up: animate text content from 0 → total over 1.4s.
  const steps = 14;
  const countValues = Array.from({ length: steps + 1 }, (_, i) =>
    fmtInt(Math.round((total * i) / steps)),
  ).join(";");

  return {
    contentType: "image/svg+xml; charset=utf-8",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`${total} commits in the last year by ${data.overview.login}`)}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="${theme.gradient}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${theme.bg}" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="sheen" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${theme.accent}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0"/>
    </linearGradient>
    <style>
      .num { font: 700 64px ui-sans-serif, system-ui, sans-serif; fill: ${theme.text}; }
      .label { font: 500 16px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; }
      .sub { font: 400 13px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; }
      .accent { fill: ${theme.accent}; }
      .num, .label, .sub { opacity: 0; animation: fade-in 600ms ease-out forwards; }
      .num { animation-delay: 100ms; }
      .label { animation-delay: 300ms; }
      .sub { animation-delay: 450ms; }
      @keyframes fade-in {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
  </defs>
  <rect width="${width}" height="${height}" rx="14" ry="14" fill="url(#bg)" stroke="${theme.stroke}" stroke-width="1"/>
  <rect width="${width}" height="${height}" rx="14" ry="14" fill="url(#sheen)">
    <animateTransform attributeName="transform" type="translate" from="${-width} 0" to="${width} 0" dur="3.2s" repeatCount="indefinite"/>
  </rect>
  <text class="num accent" x="32" y="100" text-anchor="start">
    ${esc(fmtInt(total))}
    <animate attributeName="textContent" values="${countValues}" dur="1.4s" fill="freeze" begin="0.1s"/>
  </text>
  <text class="label" x="32" y="130" text-anchor="start">${esc(label)}</text>
  <text class="sub" x="32" y="${height - 22}" text-anchor="start">${esc(sub)}</text>
  <text class="sub" x="${width - 22}" y="${height - 22}" text-anchor="end" opacity="0.6">@${esc(data.overview.login)}</text>
</svg>`,
  };
};

// ── Satori PNG renderer ──────────────────────────────────────────────
const renderPng: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const total = data.contrib.totalCommitsLastYear;
  const sub = `${data.overview.name ?? data.overview.login} • ${fmtInt(data.overview.publicRepoCount)} public repos`;
  const img = new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "28px 32px",
        backgroundImage: `radial-gradient(circle at 50% 50%, ${theme.gradient} 0%, ${theme.bg} 75%)`,
        backgroundColor: theme.bg,
        border: `1px solid ${theme.stroke}`,
        borderRadius: 14,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: theme.accent,
            lineHeight: 1,
          }}
        >
          {fmtInt(total)}
        </div>
        <div style={{ fontSize: 16, color: theme.textMuted }}>
          commits in the last year
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: theme.textMuted,
          fontSize: 13,
        }}
      >
        <span>{sub}</span>
        <span style={{ opacity: 0.6 }}>@{data.overview.login}</span>
      </div>
    </div>,
    { width, height },
  );
  const arr = new Uint8Array(await img.arrayBuffer());
  return { body: arr, contentType: "image/png" };
};

export const commitsCard: Card<Input, Data> = {
  name: "commits",
  runtime: "edge",
  defaultSize: { width: DEFAULT_W, height: DEFAULT_H },
  input: Input,
  resolve: async (input, cache) => {
    // Two atoms — userOverview and userContributions — fetched in
    // parallel. Sharing the cache means a compound card using both
    // this card and another GitHub-user card dedupes the lookups.
    const [overview, contrib] = await Promise.all([
      userOverview({ login: input.user }, cache),
      userContributions({ login: input.user }, cache),
    ]);
    return { overview, contrib };
  },
  formats: {
    svg: renderSvg,
    png: renderPng,
  },
  meta: {
    title: "Commits in the last year",
    description:
      "Total commit contributions for a GitHub user over the trailing 12 months, with the user's public-repo count. Animated count-up + accent sheen sweep in SVG.",
    dimensions: ["user"],
    supportsAnimation: true,
  },
};
