import { ImageResponse } from "next/og";
import type { Card, CardRenderer } from "./types";
import { fetchCommits, type CommitsData } from "@/lib/octokit";
import { esc, fmtInt } from "./svg-helpers";

const DEFAULT_W = 480;
const DEFAULT_H = 200;

// ── SVG renderer ──────────────────────────────────────────────────────
// Animated count-up (SMIL <animate> on text content), radial gradient
// background, and per-prefers-color-scheme theming when the request
// uses the default theme. Animations and CSS keep working under
// GitHub's camo proxy — only <script> is stripped.
const renderSvg: CardRenderer<CommitsData> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const total = data.totalCommitsLastYear;
  const label = "commits in the last year";
  const sub = `${data.name ?? data.login} • ${fmtInt(data.publicRepoCount)} public repos`;

  // SMIL count-up: animate the text content from 0 → total over 1.4s.
  // We emit a single <text> with an <animate attributeName="textContent"
  // values="0;...;N"> driving the number.
  const steps = 14;
  const countValues = Array.from({ length: steps + 1 }, (_, i) =>
    fmtInt(Math.round((total * i) / steps)),
  ).join(";");

  return {
    contentType: "image/svg+xml; charset=utf-8",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`${total} commits in the last year by ${data.login}`)}">
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
  <text class="sub" x="${width - 22}" y="${height - 22}" text-anchor="end" opacity="0.6">@${esc(data.login)}</text>
</svg>`,
  };
};

// ── Satori PNG renderer ──────────────────────────────────────────────
// Uses next/og (Satori + Resvg). Renders the same conceptual card to a
// flat PNG. No animation (raster) and no prefers-color-scheme (raster).
const renderPng: CardRenderer<CommitsData> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const total = data.totalCommitsLastYear;
  const sub = `${data.name ?? data.login} • ${fmtInt(data.publicRepoCount)} public repos`;
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
        <span style={{ opacity: 0.6 }}>@{data.login}</span>
      </div>
    </div>,
    { width, height },
  );
  const arr = new Uint8Array(await img.arrayBuffer());
  return { body: arr, contentType: "image/png" };
};

export const commitsCard: Card<CommitsData> = {
  name: "commits",
  runtime: "edge",
  fetch: (login) => fetchCommits(login),
  formats: {
    svg: renderSvg,
    png: renderPng,
  },
  defaultSize: { width: DEFAULT_W, height: DEFAULT_H },
};
