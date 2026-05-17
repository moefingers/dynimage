import { z } from "zod";
import type { Card, CardRenderer, Theme } from "./types";
import {
  userOverview,
  userTopLanguages,
  type UserOverview,
  type UserTopLanguages,
} from "@/lib/data/atoms";

const DEFAULT_W = 720;
const DEFAULT_H = 320;

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
  languages: UserTopLanguages;
};

// Skia-rendered portrait card. Uses @napi-rs/canvas (Node-only).
// Demonstrates the full canvas API: gradient backgrounds, shadow blur,
// arc compositions, image compositing (avatar), language pill row.
async function renderSkia(
  data: Data,
  theme: Theme,
  width: number,
  height: number,
): Promise<Buffer> {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background with a radial wash.
  const radial = ctx.createRadialGradient(
    width * 0.25,
    height * 0.5,
    20,
    width * 0.25,
    height * 0.5,
    width * 0.7,
  );
  radial.addColorStop(0, theme.gradient);
  radial.addColorStop(1, theme.bg);
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = theme.bg;
  // Border via stroked round rect.
  roundRect(ctx, 0.5, 0.5, width - 1, height - 1, 14);
  ctx.strokeStyle = theme.stroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Avatar: clip to circle.
  const avatarSize = 140;
  const avatarX = 56;
  const avatarY = (height - avatarSize) / 2;
  try {
    const avatar = await loadImage(data.overview.avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2,
      avatarSize / 2,
      0,
      Math.PI * 2,
    );
    ctx.closePath();
    ctx.clip();
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 40;
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    // Accent ring around the avatar (drawn outside the clip).
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2,
      avatarSize / 2 + 4,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  } catch {
    // Fall back to a solid disc if avatar load failed.
    ctx.fillStyle = theme.stroke;
    ctx.beginPath();
    ctx.arc(
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2,
      avatarSize / 2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // Text column.
  const textX = avatarX + avatarSize + 32;
  const displayName = data.overview.name ?? data.overview.login;
  ctx.fillStyle = theme.text;
  ctx.font = "700 32px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(truncate(displayName, 24), textX, avatarY);

  ctx.fillStyle = theme.textMuted;
  ctx.font = "500 16px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`@${data.overview.login}`, textX, avatarY + 40);

  if (data.overview.bio) {
    ctx.fillStyle = theme.textMuted;
    ctx.font = "400 14px ui-sans-serif, system-ui, sans-serif";
    wrapText(
      ctx,
      data.overview.bio,
      textX,
      avatarY + 72,
      width - textX - 32,
      18,
      2,
    );
  }

  // Stats row.
  const statsY = avatarY + 130;
  drawStat(
    ctx,
    textX,
    statsY,
    String(data.overview.publicRepoCount),
    "repos",
    theme.accent,
    theme.textMuted,
  );
  drawStat(
    ctx,
    textX + 110,
    statsY,
    String(data.overview.followers),
    "followers",
    theme.accent,
    theme.textMuted,
  );
  drawStat(
    ctx,
    textX + 240,
    statsY,
    String(data.overview.following),
    "following",
    theme.accent,
    theme.textMuted,
  );

  // Language pills along the bottom.
  if (data.languages.length > 0) {
    const pillY = height - 38;
    let pillX = textX;
    ctx.font = "500 12px ui-sans-serif, system-ui, sans-serif";
    for (const lang of data.languages.slice(0, 5)) {
      const label = lang.name;
      const metrics = ctx.measureText(label);
      const pillW = metrics.width + 28;
      const pillH = 22;
      const color = lang.color ?? theme.accent;
      // Pill background
      roundRect(ctx, pillX, pillY, pillW, pillH, 11);
      ctx.fillStyle = withAlpha(color, 0.15);
      ctx.fill();
      // Color dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pillX + 10, pillY + pillH / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      // Label
      ctx.fillStyle = theme.text;
      ctx.textBaseline = "middle";
      ctx.fillText(label, pillX + 20, pillY + pillH / 2);
      ctx.textBaseline = "top";
      pillX += pillW + 8;
      if (pillX > width - 80) break;
    }
  }

  return canvas.toBuffer("image/png");
}

function roundRect(
  ctx: import("@napi-rs/canvas").SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawStat(
  ctx: import("@napi-rs/canvas").SKRSContext2D,
  x: number,
  y: number,
  value: string,
  label: string,
  accent: string,
  muted: string,
) {
  ctx.fillStyle = accent;
  ctx.font = "700 22px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(value, x, y);
  ctx.fillStyle = muted;
  ctx.font = "500 12px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(label, x, y + 26);
}

function wrapText(
  ctx: import("@napi-rs/canvas").SKRSContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = word;
      lines += 1;
      if (lines === maxLines - 1) {
        let last = line;
        for (const w of words.slice(words.indexOf(word) + 1)) {
          const t = `${last} ${w}`;
          if (ctx.measureText(`${t}…`).width > maxWidth) break;
          last = t;
        }
        if (
          ctx.measureText(last).width > maxWidth ||
          words.indexOf(word) < words.length - 1
        ) {
          last = `${last}…`;
        }
        ctx.fillText(last, x, y + lines * lineHeight);
        return;
      }
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) {
    ctx.fillText(line, x, y + lines * lineHeight);
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function withAlpha(hexOrName: string, alpha: number): string {
  if (/^#[0-9a-fA-F]{6}$/.test(hexOrName)) {
    const r = parseInt(hexOrName.slice(1, 3), 16);
    const g = parseInt(hexOrName.slice(3, 5), 16);
    const b = parseInt(hexOrName.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hexOrName;
}

const renderPng: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const png = await renderSkia(data, theme, width, height);
  return { body: new Uint8Array(png), contentType: "image/png" };
};

const renderWebp: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const png = await renderSkia(data, theme, width, height);
  const sharp = (await import("sharp")).default;
  const webp = await sharp(png).webp({ quality: 90 }).toBuffer();
  return { body: new Uint8Array(webp), contentType: "image/webp" };
};

const renderAvif: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const png = await renderSkia(data, theme, width, height);
  const sharp = (await import("sharp")).default;
  const avif = await sharp(png).avif({ quality: 65 }).toBuffer();
  return { body: new Uint8Array(avif), contentType: "image/avif" };
};

export const portraitCard: Card<Input, Data> = {
  name: "portrait",
  runtime: "nodejs",
  defaultSize: { width: DEFAULT_W, height: DEFAULT_H },
  input: Input,
  resolve: async (input, cache) => {
    const [overview, languages] = await Promise.all([
      userOverview({ login: input.user }, cache),
      userTopLanguages({ login: input.user }, cache),
    ]);
    return { overview, languages };
  },
  formats: {
    png: renderPng,
    webp: renderWebp,
    avif: renderAvif,
  },
  meta: {
    title: "Profile portrait",
    description:
      "User card with avatar, bio, repo/follower/following counts, and top languages. Rendered via Skia (@napi-rs/canvas); transcoded to WebP/AVIF via sharp for smaller payloads.",
    dimensions: ["user"],
    supportsAnimation: false,
  },
};
