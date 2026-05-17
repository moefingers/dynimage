import { z } from "zod";
import type { Card, CardRenderer } from "./types";
import { esc } from "./svg-helpers";

const DEFAULT_W = 900;
const DEFAULT_H = 320;

// Infinite-Syndicate CTA. Branded after the live homepage at
// https://infinite-syndicate.com — same tile structure, same title.
// Pure-SVG: radial bg + hue-rotating accent + sheen sweep across tiles.
// No upstream data; the input is essentially a flag for which subdomain
// to highlight.

const Input = z.object({
  // Optional accent emphasis — defaults to "all".
  user: z
    .string()
    .min(1)
    .max(39)
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/),
  focus: z
    .enum(["all", "software", "scooter", "computer", "portal"])
    .optional()
    .default("all"),
});
type Input = z.infer<typeof Input>;

type Data = { user: string; focus: Input["focus"] };

type Tile = {
  key: NonNullable<Input["focus"]>;
  title: string;
  sub: string;
};

const TILES: Tile[] = [
  {
    key: "software",
    title: "Enterprise Software",
    sub: "Projects & Portfolio",
  },
  {
    key: "scooter",
    title: "Electric Scooter Repair",
    sub: "Service & Contact",
  },
  { key: "computer", title: "Computer Services", sub: "Setup & Optimization" },
  { key: "portal", title: "Client Portal", sub: "Invoices & Payments" },
];

const renderSvg: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const PAD = 28;
  const TITLE_H = 92;
  const tilesY = TITLE_H + 8;
  const tilesH = height - tilesY - PAD;
  const tileW = (width - PAD * 2 - (TILES.length - 1) * 14) / TILES.length;

  // Stagger tile entrance animations so they cascade in. 80ms apart.
  const tileEls = TILES.map((t, i) => {
    const x = PAD + i * (tileW + 14);
    const isFocus = data.focus !== "all" && data.focus === t.key;
    const dim = data.focus !== "all" && !isFocus;
    const cardOpacity = dim ? 0.4 : 1;
    return `<g class="tile t${i}" style="opacity:${cardOpacity}">
      <rect x="${x}" y="${tilesY}" width="${tileW}" height="${tilesH}" rx="14" ry="14" fill="${theme.bg}" stroke="${isFocus ? theme.accent : theme.stroke}" stroke-width="${isFocus ? 2 : 1}"/>
      <rect x="${x}" y="${tilesY}" width="${tileW}" height="${tilesH}" rx="14" ry="14" fill="url(#sBg)" opacity="0.55"/>
      <text x="${x + tileW / 2}" y="${tilesY + tilesH / 2 - 4}" text-anchor="middle" class="tTitle">${esc(t.title)}</text>
      <text x="${x + tileW / 2}" y="${tilesY + tilesH / 2 + 22}" text-anchor="middle" class="tSub">${esc(t.sub)}</text>
    </g>`;
  }).join("");

  // Each tile gets its own animation-delay via the .t0..t3 classes.
  const tileDelays = TILES.map(
    (_, i) =>
      `.tile.t${i}{animation:fadeUp 700ms cubic-bezier(.2,.7,.2,1) both; animation-delay:${280 + i * 90}ms;}`,
  ).join("");

  return {
    contentType: "image/svg+xml; charset=utf-8",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`Infinite Syndicate — services CTA for ${data.user}`)}">
  <defs>
    <radialGradient id="sBg" cx="50%" cy="50%" r="80%">
      <stop offset="0%" stop-color="${theme.gradient}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${theme.bg}" stop-opacity="1"/>
    </radialGradient>
    <radialGradient id="sBgWhole" cx="50%" cy="0%" r="120%">
      <stop offset="0%" stop-color="${theme.gradient}" stop-opacity="0.55"/>
      <stop offset="70%" stop-color="${theme.bg}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${theme.bg}" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="sSheen" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${theme.accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0"/>
    </linearGradient>
    <style>
      .brand { font: 800 56px ui-sans-serif, system-ui, -apple-system, sans-serif; fill: ${theme.text}; letter-spacing: -0.01em; }
      .tag   { font: 500 14px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; letter-spacing: 0.18em; text-transform: uppercase; }
      .tTitle{ font: 700 18px ui-sans-serif, system-ui, sans-serif; fill: ${theme.text}; }
      .tSub  { font: 500 13px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; }
      .hueShift{ animation: hueShift 14s linear infinite; transform-origin: center; }
      @keyframes hueShift {
        0%   { filter: hue-rotate(0deg); }
        100% { filter: hue-rotate(360deg); }
      }
      .brand { opacity: 0; animation: fadeUp 700ms cubic-bezier(.2,.7,.2,1) 80ms both; }
      .tag   { opacity: 0; animation: fadeUp 700ms cubic-bezier(.2,.7,.2,1) 180ms both; }
      ${tileDelays}
      @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    </style>
  </defs>
  <rect width="${width}" height="${height}" rx="20" ry="20" fill="url(#sBgWhole)" stroke="${theme.stroke}" stroke-width="1"/>
  <g class="hueShift">
    <rect width="${width}" height="${height}" rx="20" ry="20" fill="url(#sSheen)">
      <animateTransform attributeName="transform" type="translate" from="${-width} 0" to="${width} 0" dur="5.4s" repeatCount="indefinite"/>
    </rect>
  </g>
  <text class="tag"   x="${width / 2}" y="38" text-anchor="middle">A SUITE OF SERVICES · BROUGHT TOGETHER</text>
  <text class="brand" x="${width / 2}" y="84" text-anchor="middle">Infinite Syndicate</text>
  ${tileEls}
  <text class="tag" x="${width - PAD}" y="${height - 8}" text-anchor="end" opacity="0.6">infinite-syndicate.com · @${esc(data.user)}</text>
</svg>`,
  };
};

export const syndicateCard: Card<Input, Data> = {
  name: "syndicate",
  runtime: "edge",
  defaultSize: { width: DEFAULT_W, height: DEFAULT_H },
  input: Input,
  resolve: async (input) => ({ user: input.user, focus: input.focus }),
  formats: {
    svg: renderSvg,
  },
  meta: {
    title: "Infinite Syndicate — services CTA",
    description:
      "Branded CTA matching the infinite-syndicate.com homepage: four service tiles + brand title + hue-rotating sheen sweep. Optional focus= dims non-target tiles.",
    dimensions: ["user"],
    supportsAnimation: true,
  },
};
