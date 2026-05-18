import { z } from "zod";
import type { Card, CardRenderer } from "./types";
import { esc } from "./svg-helpers";
import {
  SYNDICATE_LATTICE_PATH_A,
  SYNDICATE_LATTICE_PATH_B,
  SYNDICATE_LATTICE_VB,
  SYNDICATE_TEAL,
} from "./syndicate-lattice";

const DEFAULT_W = 900;
const DEFAULT_H = 320;

// Infinite-Syndicate CTA. Centered around the brand sacred-geometry
// lattice from infinite-syndicate.com/public/radial1.svg — two
// counter-rotating layers of intersecting circles, with the brand teal
// stroke and a slow hue-rotate for depth. Tiles overlay the lattice;
// the title sits centered between the lattice center and the top edge.

const Input = z.object({
  user: z
    .string()
    .min(1)
    .max(39)
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/),
  focus: z
    .enum(["all", "software", "computer", "portal"])
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

// Tile copy here intentionally diverges from the live homepage's literal
// nav strings. The README context is dev-portfolio-focused, so we drop
// the scooter tile and rephrase the software + computer tiles so the
// reader's first scan is "websites/apps" and "IT/business setup".
const TILES: Tile[] = [
  { key: "software", title: "Software", sub: "Apps, Sites & Tools" },
  { key: "computer", title: "Computers", sub: "Workstations, IT & Setup" },
  { key: "portal", title: "Client Portal", sub: "Invoices, Documents & Pay" },
];

const renderSvg: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const PAD = 28;
  const TITLE_H = 102;
  const tilesY = TITLE_H + 14;
  const tilesH = height - tilesY - PAD;
  const tileW = (width - PAD * 2 - (TILES.length - 1) * 14) / TILES.length;

  // Two lattice instances — fill most of the banner's vertical extent
  // and bleed past the horizontal edges so the geometry feels infinite.
  // The native viewBox is 300×300; we scale uniformly to lattice_size
  // and we want the path's (150,150) center to sit at the banner
  // center (latticeCx, latticeCy). Compose all animations around that
  // local center using pure-SMIL animateTransform with additive="sum"
  // so the scale + rotate stack as separate transform-list entries —
  // no CSS bbox guessing, no drift toward the banner corners.
  const latticeSize = Math.max(height * 1.5, 500);
  const latticeCx = width / 2;
  const latticeCy = height / 2;
  const scale = latticeSize / SYNDICATE_LATTICE_VB;
  // Outer static wrap: shift origin to (latticeCx, latticeCy), then
  // apply uniform scale. After this, the inner coord system has (0,0)
  // at the banner center; the path needs translate(-150,-150) to sit
  // around that center.
  const latticeOuterTx = `translate(${latticeCx} ${latticeCy}) scale(${scale.toFixed(4)})`;

  // Per-tile clipPath so each tile's shimmer can sweep an inner rect
  // across the tile without bleeding outside its rounded corners.
  const tileClips = TILES.map((_, i) => {
    const x = PAD + i * (tileW + 14);
    return `<clipPath id="tileClip-${i}"><rect x="${x}" y="${tilesY}" width="${tileW}" height="${tilesH}" rx="14" ry="14"/></clipPath>`;
  }).join("");

  // Stagger each tile's shimmer so they don't all fire in unison —
  // total loop is 5.4s split evenly across the three tiles.
  const SHIMMER_DUR = 5.4;
  const tileEls = TILES.map((t, i) => {
    const x = PAD + i * (tileW + 14);
    const isFocus = data.focus !== "all" && data.focus === t.key;
    const dim = data.focus !== "all" && !isFocus;
    const cardOpacity = dim ? 0.4 : 1;
    const beginOffset = (-i * (SHIMMER_DUR / TILES.length)).toFixed(2);
    return `<g class="tile t${i}" style="opacity:${cardOpacity}">
      <rect x="${x}" y="${tilesY}" width="${tileW}" height="${tilesH}" rx="14" ry="14" fill="${theme.bg}" fill-opacity="0.72" stroke="${isFocus ? SYNDICATE_TEAL : theme.stroke}" stroke-width="${isFocus ? 2 : 1}"/>
      <g clip-path="url(#tileClip-${i})">
        <rect x="${x}" y="${tilesY}" width="${tileW}" height="${tilesH}" rx="14" ry="14" fill="url(#tileShimmerGrad)">
          <animateTransform attributeName="transform" type="translate" from="${-tileW} 0" to="${tileW} 0" dur="${SHIMMER_DUR}s" begin="${beginOffset}s" repeatCount="indefinite"/>
        </rect>
      </g>
      <text x="${x + tileW / 2}" y="${tilesY + tilesH / 2 - 4}" text-anchor="middle" class="tTitle">${esc(t.title)}</text>
      <text x="${x + tileW / 2}" y="${tilesY + tilesH / 2 + 22}" text-anchor="middle" class="tSub">${esc(t.sub)}</text>
    </g>`;
  }).join("");

  const tileDelays = TILES.map(
    (_, i) =>
      `.tile.t${i}{animation:fadeUp 700ms cubic-bezier(.2,.7,.2,1) both; animation-delay:${340 + i * 90}ms;}`,
  ).join("");

  return {
    contentType: "image/svg+xml; charset=utf-8",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`Infinite Syndicate — services CTA for ${data.user}`)}">
  <defs>
    <radialGradient id="sLatticeGrad" cx="50%" cy="50%" r="50%">
      <stop offset="16%" stop-color="${SYNDICATE_TEAL}" stop-opacity="0"/>
      <stop offset="35%" stop-color="${SYNDICATE_TEAL}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#808080" stop-opacity="0.95"/>
    </radialGradient>
    <radialGradient id="sLatticeGradB" cx="50%" cy="50%" r="50%">
      <stop offset="2%" stop-color="#6f6f6f" stop-opacity="0"/>
      <stop offset="35%" stop-color="#6f6f6f" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#808080" stop-opacity="0.85"/>
    </radialGradient>
    <!-- Per-tile shimmer gradient — narrow teal band, transparent at the
         edges. Each tile's inner sweep rect uses this same gradient
         shifted in time so the three tiles shimmer out of phase. -->
    <linearGradient id="tileShimmerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"  stop-color="${SYNDICATE_TEAL}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${SYNDICATE_TEAL}" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="${SYNDICATE_TEAL}" stop-opacity="0"/>
    </linearGradient>
    ${tileClips}
    <!-- Mask softens the lattice behind the title for legibility — but
         lightly enough that the flowers still show through. White =
         lattice visible, lower alpha = lattice dimmer. The inner
         stops used to drop to alpha=0 (lattice fully hidden, hard
         "shadow"); now they hold at ~0.55 so the geometry peeks
         through and the title still reads clearly. -->
    <radialGradient id="sLatticeMaskGrad" cx="50%" cy="34%" r="55%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.5"/>
      <stop offset="35%" stop-color="#fff" stop-opacity="0.6"/>
      <stop offset="55%" stop-color="#fff" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="1"/>
    </radialGradient>
    <mask id="sLatticeMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#sLatticeMaskGrad)"/>
    </mask>
    <style>
      .brand { font: 800 56px ui-sans-serif, system-ui, -apple-system, sans-serif; fill: ${theme.text}; letter-spacing: -0.01em; }
      .tag   { font: 500 14px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; letter-spacing: 0.18em; text-transform: uppercase; }
      .tTitle{ font: 700 18px ui-sans-serif, system-ui, sans-serif; fill: ${theme.text}; }
      .tSub  { font: 500 13px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; }
      .lattice-hue { animation: latHue 22s linear infinite; transform-origin: center; }
      @keyframes latHue { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
      /* Counter-phased breathing now driven entirely by SMIL — see the
         animateTransform pair on each lattice group below. CSS-driven
         scale was abandoned because transform-box: fill-box still
         picked up the SMIL-rotated bounding box, which expands during
         the rotation cycle and shifted the apparent scale pivot. */
      .brand { opacity: 0; animation: fadeUp 700ms cubic-bezier(.2,.7,.2,1) 140ms both; }
      .tag   { opacity: 0; animation: fadeUp 700ms cubic-bezier(.2,.7,.2,1) 240ms both; }
      ${tileDelays}
      @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    </style>
  </defs>

  <rect width="${width}" height="${height}" rx="20" ry="20" fill="${theme.bg}" stroke="${theme.stroke}" stroke-width="1"/>

  <!-- Brand lattice. Two layers — A spins one way, B (already offset
       ~15° in the source) spins the other. Each layer also breathes
       counter-phased with the other on a 14s loop.

       Critical nesting: the SMIL animateTransform's go on the OUTER
       <g>, and the path is wrapped by an INNER <g transform="translate
       (-150 -150)"> that shifts its native (150,150) center to the
       outer g's (0,0) BEFORE any animation applies. If the translate
       were on the outer g instead, additive="sum" would stack the
       rotate/scale AFTER the translate in the transform list — and
       since SVG applies transforms right-to-left, the rotate would
       happen first (around its own origin) and the translate would
       drag the rotated geometry off-center each frame, making the
       whole lattice orbit around the banner center instead of
       staying put. -->
  <g class="lattice-hue" mask="url(#sLatticeMask)" opacity="0.85">
    <g transform="${latticeOuterTx}">
      <g>
        <g transform="translate(-150 -150)">
          <path d="${SYNDICATE_LATTICE_PATH_A}" fill="none" stroke="url(#sLatticeGrad)" stroke-width="1.4" stroke-linejoin="round"/>
        </g>
        <animateTransform attributeName="transform" type="rotate"
          values="0;360" dur="120s" repeatCount="indefinite" additive="sum"/>
        <animateTransform attributeName="transform" type="scale"
          values="1;0;1" keyTimes="0;0.5;1"
          calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
          dur="14s" repeatCount="indefinite" additive="sum"/>
      </g>
      <g>
        <g transform="translate(-150 -150)">
          <path d="${SYNDICATE_LATTICE_PATH_B}" fill="none" stroke="url(#sLatticeGradB)" stroke-width="1.4" stroke-linejoin="round"/>
        </g>
        <animateTransform attributeName="transform" type="rotate"
          values="360;0" dur="160s" repeatCount="indefinite" additive="sum"/>
        <animateTransform attributeName="transform" type="scale"
          values="0;1;0" keyTimes="0;0.5;1"
          calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
          dur="14s" repeatCount="indefinite" additive="sum"/>
      </g>
    </g>
  </g>

  <text class="tag"   x="${width / 2}" y="42" text-anchor="middle">A SUITE OF SERVICES · BROUGHT TOGETHER</text>
  <text class="brand" x="${width / 2}" y="92" text-anchor="middle">Infinite Syndicate</text>

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
      "Branded CTA built around the brand sacred-geometry lattice from infinite-syndicate.com. Two counter-rotating layers of the intersecting-circles pattern with a slow hue-rotate, brand teal stroke, masked to keep the title legible. Four service tiles overlay. Optional focus= dims non-target tiles.",
    dimensions: ["user"],
    supportsAnimation: true,
  },
};
