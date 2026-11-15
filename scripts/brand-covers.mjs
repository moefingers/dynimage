// Brand wordmark covers: Outlast AI and Recanon, 4:1 profile banners laid
// out around the profile page's chrome like the orbit cards'
// ?layout=cover (src/lib/cards/cover.ts has the measured geometry): the
// lockup starts right of the profile photo's circle, and every line
// below y ~195 stays left of the slide selector (x 794+).
//
//   node scripts/brand-covers.mjs --out <dir>
//
// Writes outlast.svg and recanon.svg (design space 1128x282). Static,
// for export: scripts/export-covers.mjs --extra rasterizes them.
//
// The marks and fonts are read from the sibling repos, so the covers
// carry the real brand assets: OutlastSite's logo.svg and Plus Jakarta
// Sans (its display face), recanon's mark-dark.svg and Geist (its
// next/font face, from its .next build cache). Override the repo roots
// with OUTLAST_REPO / RECANON_REPO.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const OUTLAST = process.env.OUTLAST_REPO ?? join(ROOT, "OutlastSite");
const RECANON = process.env.RECANON_REPO ?? join(ROOT, "recanon");

const W = 1128;
const H = 282;

const outIdx = process.argv.indexOf("--out");
if (outIdx < 0) throw new Error("--out <dir> is required");
const OUT = resolve(process.argv[outIdx + 1]);
mkdirSync(OUT, { recursive: true });

const b64 = (p) => readFileSync(p).toString("base64");
const fontFace = (family, file) =>
  `@font-face{font-family:'${family}';font-weight:100 900;src:url(data:font/woff2;base64,${b64(file)}) format('woff2');}`;

// Geist's Latin subset, from recanon's .next/static/media. next/font
// names the files by content hash; checked 2026-11-14 with fontkit:
// caa3a2e1cccd8315-s.p.*.woff2 is Geist (variable wght) with the Latin
// letters. If a rebuild renames it, point GEIST_WOFF2 at the file.
function geistLatin() {
  const dir = join(RECANON, ".next", "static", "media");
  const pick = process.env.GEIST_WOFF2;
  if (pick) return pick;
  const f = readdirSync(dir).find(
    (n) => n.startsWith("caa3a2e1cccd8315") && n.endsWith(".woff2"),
  );
  if (!f)
    throw new Error(`Geist Latin woff2 not found in ${dir}; set GEIST_WOFF2`);
  return join(dir, f);
}

// oklch → hex (sRGB), for recanon's accent tokens.
function oklch(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const enc = (x) => {
    const c = Math.min(1, Math.max(0, x));
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${lin.map(enc).join("")}`;
}

// Lockup metrics (design space W × H). x0 clears the photo's circle
// (its right edge is at x ~330); the tagline's baseline sits above the
// slide selector's top (y 202), and the domain line under it is short
// enough to end before the selector's left edge.
const M = { x0: 370, cy: 92, markH: 104, tagY: 186, tagSize: 15, domY: 214 };

function svgOpen(vh, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${vh}" viewBox="0 0 ${W} ${vh}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label}">`;
}

// ── Outlast AI ────────────────────────────────────────────────────────
function outlast() {
  const vh = H;
  const logo = readFileSync(
    join(OUTLAST, "public", "images", "logo.svg"),
    "utf8",
  );
  const paths = logo.match(/<path[^>]*\/>/g).join("");
  const markW = (M.markH * 231) / 218.7;
  const F = Math.round(M.markH * 0.61); // BrandLockup: font = mark height × 0.61
  const tx = M.x0 + markW + 0.4 * F;
  const base = M.cy + 0.36 * F;
  // "AI" spans roughly 3.75em..4.8em of the line in Jakarta Bold.
  const aiX1 = tx + 3.7 * F;
  const aiX2 = tx + 4.9 * F;
  const bg = "#131820"; // site dark --background, hsl(220 25% 10%)
  const tag = "AI AGENTS THAT CALL, CHASE &amp; RESEARCH";
  const dom = "OUTLASTAI.COM";
  const jakarta = join(
    OUTLAST,
    "app",
    "fonts",
    "plus-jakarta-sans",
    "plus-jakarta-sans-latin.woff2",
  );
  return `${svgOpen(vh, "Outlast AI — AI agents that call, chase and research")}
  <defs>
    <style>${fontFace("PJS", jakarta)}
      .o-word { font: 700 ${F}px 'PJS', sans-serif; fill: #f4f6fa; letter-spacing: -0.01em; }
      .o-tag  { font: 600 ${M.tagSize}px 'PJS', sans-serif; fill: #9aa4b5; letter-spacing: 0.22em; }
      .o-dom  { font: 700 ${M.tagSize}px 'PJS', sans-serif; fill: #59C3E5; letter-spacing: 0.22em; }
    </style>
    <radialGradient id="o-g1" gradientUnits="userSpaceOnUse" cx="${M.x0 + markW / 2}" cy="${M.cy}" r="${vh * 1.5}">
      <stop offset="0" stop-color="#3453C3" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#3453C3" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="o-g2" gradientUnits="userSpaceOnUse" cx="${W * 0.86}" cy="${vh * 0.15}" r="${vh * 1.4}">
      <stop offset="0" stop-color="#63C995" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#63C995" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="o-g3" gradientUnits="userSpaceOnUse" cx="${W * 0.7}" cy="${vh * 1.05}" r="${vh * 1.1}">
      <stop offset="0" stop-color="#59C3E5" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#59C3E5" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="o-ai" gradientUnits="userSpaceOnUse" x1="${aiX1}" y1="${base - F * 0.75}" x2="${aiX2}" y2="${base}">
      <stop offset="0" stop-color="#4789ca"/>
      <stop offset="0.55" stop-color="#427fd1"/>
      <stop offset="1" stop-color="#55a293"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${vh}" fill="${bg}"/>
  <rect width="${W}" height="${vh}" fill="url(#o-g1)"/>
  <rect width="${W}" height="${vh}" fill="url(#o-g2)"/>
  <rect width="${W}" height="${vh}" fill="url(#o-g3)"/>
  <svg x="${M.x0}" y="${M.cy - M.markH / 2}" width="${markW.toFixed(2)}" height="${M.markH}" viewBox="0 0 231 218.7">${paths}</svg>
  <text class="o-word" x="${tx.toFixed(1)}" y="${base.toFixed(1)}">Outlast <tspan fill="url(#o-ai)">AI</tspan></text>
  <text class="o-tag" x="${M.x0}" y="${M.tagY}">${tag}</text>
  <text class="o-dom" x="${M.x0}" y="${M.domY}">${dom}</text>
</svg>`;
}

// ── Recanon ───────────────────────────────────────────────────────────
const LATTICE_SRC = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "src",
    "lib",
    "cards",
    "syndicate-lattice.ts",
  ),
  "utf8",
);
const latticePath = (name) =>
  new RegExp(`${name} =\\s*"([^"]+)"`).exec(LATTICE_SRC)[1];

function recanon() {
  const vh = H;
  const mark = readFileSync(
    join(RECANON, "public", "brand", "mark-dark.svg"),
    "utf8",
  );
  const markInner = mark.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const F = Math.round(M.markH * 0.66);
  const tx = M.x0 + M.markH + 0.32 * F;
  const base = M.cy + 0.36 * F;
  const teal = oklch(0.72, 0.12, 200);
  const blue = oklch(0.72, 0.15, 250);
  const purple = oklch(0.75, 0.16, 300);
  const latTeal = "#2CB0CF";
  // The brand lattice, centered behind the lockup.
  const latCx = M.x0 + 290;
  const latSize = vh * 1.75;
  const s = latSize / 300;
  const wordW = 3.55 * F; // "Recanon" in Geist Bold ≈ 3.55em
  const tag = "THE SITE THEY SEE · THE SOFTWARE BEHIND IT";
  const dom = "RECANON.COM";
  const geist = geistLatin();
  return `${svgOpen(vh, "Recanon — the site they see, the software behind it")}
  <defs>
    <style>${fontFace("GeistB", geist)}
      .r-word { font: 700 ${F}px 'GeistB', sans-serif; letter-spacing: -0.02em; }
      .r-tag  { font: 500 ${M.tagSize}px 'GeistB', sans-serif; fill: #a1a1aa; letter-spacing: 0.2em; }
      .r-dom  { font: 600 ${M.tagSize}px 'GeistB', sans-serif; fill: ${teal}; letter-spacing: 0.2em; }
    </style>
    <linearGradient id="r-word" gradientUnits="userSpaceOnUse" x1="${tx}" y1="${base - F}" x2="${tx + wordW}" y2="${base}">
      <stop offset="0" stop-color="${teal}"/>
      <stop offset="0.5" stop-color="${blue}"/>
      <stop offset="1" stop-color="${purple}"/>
    </linearGradient>
    <filter id="r-glow" x="-20%" y="-60%" width="140%" height="220%">
      <feDropShadow dx="0" dy="0" stdDeviation="${(F * 0.2).toFixed(1)}" flood-color="${blue}" flood-opacity="0.35"/>
    </filter>
    <radialGradient id="r-latA" cx="50%" cy="50%" r="50%">
      <stop offset="16%" stop-color="${latTeal}" stop-opacity="0"/>
      <stop offset="35%" stop-color="${latTeal}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#808080" stop-opacity="0.95"/>
    </radialGradient>
    <radialGradient id="r-latB" cx="50%" cy="50%" r="50%">
      <stop offset="2%" stop-color="#6f6f6f" stop-opacity="0"/>
      <stop offset="35%" stop-color="#6f6f6f" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#808080" stop-opacity="0.85"/>
    </radialGradient>
    <radialGradient id="r-glowBg" gradientUnits="userSpaceOnUse" cx="${latCx}" cy="${vh / 2}" r="${vh * 2.2}">
      <stop offset="0" stop-color="#1e3a5f" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#0a0a0a" stop-opacity="0"/>
    </radialGradient>
    <!-- Dims the lattice behind the words, so they read. -->
    <radialGradient id="r-soft" gradientUnits="userSpaceOnUse" cx="${tx + wordW / 2}" cy="${M.cy}" r="${wordW * 0.75}">
      <stop offset="0" stop-color="#fff" stop-opacity="0.28"/>
      <stop offset="0.6" stop-color="#fff" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#fff" stop-opacity="1"/>
    </radialGradient>
    <mask id="r-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${vh}">
      <rect width="${W}" height="${vh}" fill="url(#r-soft)"/>
    </mask>
  </defs>
  <rect width="${W}" height="${vh}" fill="#0a0a0a"/>
  <rect width="${W}" height="${vh}" fill="url(#r-glowBg)"/>
  <g mask="url(#r-mask)" opacity="0.7">
    <g transform="translate(${latCx} ${vh / 2}) scale(${s.toFixed(4)})">
      <g transform="rotate(-8)"><g transform="translate(-150 -150)"><path d="${latticePath("SYNDICATE_LATTICE_PATH_A")}" fill="none" stroke="url(#r-latA)" stroke-width="${(1.4 / s).toFixed(2)}" stroke-linejoin="round"/></g></g>
      <g transform="rotate(6)"><g transform="translate(-150 -150)"><path d="${latticePath("SYNDICATE_LATTICE_PATH_B")}" fill="none" stroke="url(#r-latB)" stroke-width="${(1.2 / s).toFixed(2)}" stroke-linejoin="round"/></g></g>
    </g>
  </g>
  <svg x="${M.x0}" y="${M.cy - M.markH / 2}" width="${M.markH}" height="${M.markH}" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">${markInner}</svg>
  <text class="r-word" x="${tx.toFixed(1)}" y="${base.toFixed(1)}" fill="url(#r-word)" filter="url(#r-glow)">Recanon</text>
  <text class="r-tag" x="${M.x0}" y="${M.tagY}">${tag}</text>
  <text class="r-dom" x="${M.x0}" y="${M.domY}">${dom}</text>
</svg>`;
}

for (const [name, build] of [
  ["outlast", outlast],
  ["recanon", recanon],
]) {
  const p = join(OUT, `${name}.svg`);
  writeFileSync(p, build());
  console.log(`wrote ${p}`);
}
