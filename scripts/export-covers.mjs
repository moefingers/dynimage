// Export the orbit cards' cover layout (?layout=cover) as static WebP
// profile banners: 4:1, at 4x (4512x1128), LinkedIn's canonical shape at
// the largest size it accepts.
//
//   node --import ./.bootstrap.mjs scripts/export-covers.mjs --out <dir>
//        [--only commits-orbit,typing-orbit,...]
//        [--extra <name>:<cover.svg>:<seconds>] ...
//        [--preview]   (1x PNG instead, for a look)
//
// Live data: the cards resolve against GitHub / Nitrotype with the
// .env.local token (.bootstrap.mjs loads it). --extra adds 4:1 covers
// made elsewhere (scripts/brand-covers.mjs, unlv-museum's --cover) to
// the same run.
//
// The vector is rasterized at the export's own pixel size in headless
// Chrome, never upscaled. SMIL animations are paused at a chosen moment
// (when the brand mark is near full breath) and the CSS fade-ins are
// finished, so the still shows the settled banner.

import { registerHooks } from "node:module";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

// The orbit cards are .tsx without JSX: load them as TypeScript.
registerHooks({
  load(url, ctx, next) {
    if (url.startsWith("file:") && url.endsWith(".tsx")) {
      return {
        format: "module-typescript",
        source: readFileSync(fileURLToPath(url), "utf8"),
        shortCircuit: true,
      };
    }
    return next(url, ctx);
  },
});

const EXPORT_SIZE = [4512, 1128];
const PREVIEW_SIZE = [1128, 282];

const CARDS = {
  "commits-orbit": { user: "moefingers", at: 2.7 },
  "typing-orbit": { user: "bigmoemoney", at: 3.1 },
};

const CHROME = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => p && existsSync(p));

function args() {
  const a = process.argv.slice(2);
  const out = { out: null, only: null, extra: [], preview: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--out") out.out = resolve(a[++i]);
    else if (a[i] === "--preview") out.preview = true;
    else if (a[i] === "--only") out.only = a[++i].split(",");
    else if (a[i] === "--extra") {
      // name:cover.svg:seconds — split on ":" not followed by a path
      // separator, so a drive letter (D:/...) stays in the path.
      const [name, svg, at] = a[++i].split(/:(?![\\/])/);
      out.extra.push({ name, svg, at: Number(at ?? 0) });
    }
  }
  if (!out.out) throw new Error("--out <dir> is required");
  return out;
}

async function renderCard(name, user) {
  const { dispatchCard } = await import("@/lib/cards/dispatch");
  const mod =
    name === "commits-orbit"
      ? (await import("@/lib/cards/commits-orbit")).commitsOrbitCard
      : (await import("@/lib/cards/typing-orbit")).typingOrbitCard;
  const res = await dispatchCard({
    statSegment: `${name}.svg`,
    searchParams: new URLSearchParams({ layout: "cover" }),
    pathParams: { user },
    runtime: mod.runtime,
    ifNoneMatch: null,
    baseUrl: "http://localhost:3000",
    getCard: (n) => (n === name ? mod : null),
  });
  const body = await res.text();
  if (res.status !== 200) throw new Error(`${name}: ${res.status} ${body}`);
  return body;
}

// Set the root <svg>'s pixel size; the viewBox keeps the design space.
function sized(svg, w, h) {
  return svg.replace(/<svg\b[^>]*>/, (tag) =>
    tag
      .replace(/\swidth="[^"]*"/, ` width="${w}"`)
      .replace(/\sheight="[^"]*"/, ` height="${h}"`),
  );
}

function rasterize(svg, w, h, atSeconds, pngPath) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#000;overflow:hidden}
svg{display:block}
svg *{animation-duration:0s!important;animation-delay:0s!important}
</style></head><body>${svg}<script>
const s=document.querySelector("svg");
s.pauseAnimations();s.setCurrentTime(${atSeconds});
</script></body></html>`;
  const htmlPath = pngPath.replace(/\.png$/, ".html");
  writeFileSync(htmlPath, html);
  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--virtual-time-budget=1500",
      `--window-size=${w},${h}`,
      `--screenshot=${pngPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { stdio: "ignore" },
  );
  rmSync(htmlPath);
}

async function exportOne(name, svg, at) {
  const [w, h] = opt.preview ? PREVIEW_SIZE : EXPORT_SIZE;
  const base = `${name}_${w}x${h}`;
  const png = join(opt.out, `${base}.png`);
  rasterize(sized(svg, w, h), w, h, at, png);
  const meta = await sharp(png).metadata();
  if (meta.width !== w || meta.height !== h) {
    throw new Error(`${base}: got ${meta.width}x${meta.height}`);
  }
  if (opt.preview) {
    console.log(`${base}.png`);
    return;
  }
  const webp = join(opt.out, `${base}.webp`);
  await sharp(png).webp({ lossless: true, effort: 6 }).toFile(webp);
  rmSync(png);
  const kb = (readFileSync(webp).length / 1024).toFixed(0);
  console.log(`${base}.webp  ${kb} KB`);
}

const opt = args();
if (!CHROME) throw new Error("Chrome not found; set CHROME=<path>");
mkdirSync(opt.out, { recursive: true });

for (const [name, { user, at }] of Object.entries(CARDS)) {
  if (opt.only && !opt.only.includes(name)) continue;
  await exportOne(name, await renderCard(name, user), at);
}
for (const x of opt.extra) {
  if (opt.only && !opt.only.includes(x.name)) continue;
  await exportOne(x.name, readFileSync(x.svg, "utf8"), x.at);
}
