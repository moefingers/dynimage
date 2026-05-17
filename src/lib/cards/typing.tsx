import { z } from "zod";
import type { Card, CardRenderer } from "./types";
import { nitrotypeRacer, type NitrotypeRacer } from "@/lib/data/nitrotype";
import { esc, fmtInt } from "./svg-helpers";

const DEFAULT_W = 520;
const DEFAULT_H = 220;

// Live WPM card. Pulls from nitrotype-api.vercel.app (which proxies
// nitrotype.com's profile RACER_INFO blob).
//
// Animations: SMIL count-up on the avg-WPM headline, sheen sweep across
// the background, color-shifting accent on the racing-stripe pill.

const Input = z.object({
  // Nitrotype usernames don't follow GitHub's strict pattern; allow more
  // characters but keep length bounded.
  user: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_]+$/),
});
type Input = z.infer<typeof Input>;

type Data = { racer: NitrotypeRacer };

function buildCountUp(total: number, steps: number): string {
  const vals: string[] = [];
  for (let k = 0; k <= steps; k++) {
    vals.push(fmtInt(Math.round((total * k) / steps)));
  }
  return vals.join(";");
}

function tierLabel(t: number): string {
  switch (t) {
    case 5:
      return "DIAMOND";
    case 4:
      return "PLATINUM";
    case 3:
      return "GOLD";
    case 2:
      return "SILVER";
    case 1:
      return "BRONZE";
    default:
      return "UNRANKED";
  }
}

const renderSvg: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const r = data.racer;
  const avgCount = buildCountUp(r.avgSpeed, 22);
  const peakCount = buildCountUp(r.highestSpeed, 22);
  const racesCount = buildCountUp(r.racesPlayed, 18);

  // Tier color — riff on standard nitrotype tier colors so the pill
  // reads at-a-glance to racers.
  const tierColor =
    r.leagueTier >= 5
      ? "#22d3ee"
      : r.leagueTier === 4
        ? "#e5e7eb"
        : r.leagueTier === 3
          ? "#fbbf24"
          : r.leagueTier === 2
            ? "#94a3b8"
            : r.leagueTier === 1
              ? "#a16207"
              : theme.textMuted;

  const display = r.displayName ?? r.username;

  return {
    contentType: "image/svg+xml; charset=utf-8",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`${display} typing speed: ${r.avgSpeed} WPM average, ${r.highestSpeed} WPM peak`)}">
  <defs>
    <radialGradient id="tBg" cx="20%" cy="0%" r="120%">
      <stop offset="0%" stop-color="${theme.gradient}" stop-opacity="0.65"/>
      <stop offset="100%" stop-color="${theme.bg}" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="tSheen" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${theme.accent}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="tStripe" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${tierColor}" stop-opacity="0.0"/>
      <stop offset="35%" stop-color="${tierColor}" stop-opacity="1"/>
      <stop offset="65%" stop-color="${tierColor}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${tierColor}" stop-opacity="0.0"/>
    </linearGradient>
    <style>
      .head { font: 700 60px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.text}; }
      .unit { font: 600 22px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.textMuted}; }
      .lbl  { font: 500 12px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; letter-spacing: 0.18em; text-transform: uppercase; }
      .num  { font: 700 22px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.text}; }
      .name { font: 700 22px ui-sans-serif, system-ui, sans-serif; fill: ${theme.text}; }
      .tier { font: 700 11px ui-sans-serif, system-ui, sans-serif; fill: ${tierColor}; letter-spacing: 0.22em; }
      .pulse-stripe { animation: stripeShift 4s ease-in-out infinite alternate; }
      @keyframes stripeShift {
        0%   { opacity: 0.55; }
        100% { opacity: 1; }
      }
      .head, .name, .lbl, .num, .tier, .unit { opacity: 0; animation: fadeIn 600ms ease-out forwards; }
      .name { animation-delay: 80ms; }
      .head { animation-delay: 220ms; }
      .unit { animation-delay: 320ms; }
      .lbl  { animation-delay: 380ms; }
      .num  { animation-delay: 460ms; }
      .tier { animation-delay: 520ms; }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    </style>
  </defs>
  <rect width="${width}" height="${height}" rx="16" ry="16" fill="url(#tBg)" stroke="${theme.stroke}" stroke-width="1"/>
  <rect width="${width}" height="${height}" rx="16" ry="16" fill="url(#tSheen)">
    <animateTransform attributeName="transform" type="translate" from="${-width} 0" to="${width} 0" dur="3.6s" repeatCount="indefinite"/>
  </rect>
  <rect class="pulse-stripe" x="0" y="${height - 6}" width="${width}" height="6" fill="url(#tStripe)"/>
  <text class="name" x="28" y="38">${esc(display)}</text>
  <text class="lbl"  x="28" y="58">@${esc(r.username)} · ${esc(tierLabel(r.leagueTier))}</text>
  <text class="head" x="28" y="130">${r.avgSpeed}<animate attributeName="textContent" values="${avgCount}" dur="1.6s" fill="freeze" begin="0.25s"/></text>
  <text class="unit" x="${28 + String(r.avgSpeed).length * 36 + 6}" y="130">WPM</text>
  <text class="lbl"  x="28" y="152">avg · last 10 races</text>
  <text class="lbl"  x="${width - 28}" y="100" text-anchor="end">PEAK</text>
  <text class="num"  x="${width - 28}" y="124" text-anchor="end">${r.highestSpeed} <tspan font-size="13" fill="${theme.textMuted}">WPM</tspan><animate attributeName="textContent" values="${peakCount}" dur="1.4s" fill="freeze" begin="0.35s"/></text>
  <text class="lbl"  x="${width - 28}" y="146" text-anchor="end">RACES</text>
  <text class="num"  x="${width - 28}" y="170" text-anchor="end">${fmtInt(r.racesPlayed)}<animate attributeName="textContent" values="${racesCount}" dur="1.4s" fill="freeze" begin="0.45s"/></text>
  <text class="tier" x="28" y="${height - 16}">NITROTYPE.COM</text>
</svg>`,
  };
};

export const typingCard: Card<Input, Data> = {
  name: "typing",
  runtime: "edge",
  defaultSize: { width: DEFAULT_W, height: DEFAULT_H },
  input: Input,
  resolve: async (input, cache) => ({
    racer: await nitrotypeRacer({ username: input.user }, cache),
  }),
  formats: {
    svg: renderSvg,
  },
  meta: {
    title: "Typing speed (nitrotype)",
    description:
      "Live WPM stats from nitrotype.com via nitrotype-api proxy. Animated count-up to avg/peak WPM and races, racing-stripe accent, tier badge.",
    dimensions: ["user"],
    supportsAnimation: true,
  },
};
