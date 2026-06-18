import { test } from "node:test";
import assert from "node:assert/strict";
import { disabledPlaceholderSvg, placeholderSize } from "./placeholder.ts";

test("placeholderSize reads canvas dims from a stored config", () => {
  assert.deepEqual(placeholderSize({ canvas: { w: 900, h: 320 } }), {
    w: 900,
    h: 320,
  });
});

test("placeholderSize falls back + clamps for missing/insane dims", () => {
  assert.deepEqual(placeholderSize(null), { w: 480, h: 240 });
  assert.deepEqual(placeholderSize({}), { w: 480, h: 240 });
  assert.deepEqual(placeholderSize({ canvas: {} }), { w: 480, h: 240 });
  // out-of-range → fallback (no giant/zero placeholder)
  assert.deepEqual(placeholderSize({ canvas: { w: 0, h: 99999 } }), {
    w: 480,
    h: 240,
  });
  assert.deepEqual(placeholderSize({ canvas: { w: 800.6, h: 300.2 } }), {
    w: 801,
    h: 300,
  });
});

test("disabledPlaceholderSvg is a valid neutral SVG at the given size", () => {
  const svg = disabledPlaceholderSvg(900, 320);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /width="900" height="320"/);
  assert.match(svg, /viewBox="0 0 900 320"/);
  assert.match(svg, />embed removed<\/text>/);
  assert.match(svg, /<\/svg>$/);
  assert.match(svg, /aria-label="embed removed"/);
});

test("disabledPlaceholderSvg leaks nothing about the original embed", () => {
  // Even if a (hypothetical) caller passed config-derived text, the
  // generator only takes numeric w/h — it can't emit scene content/owner.
  const svg = disabledPlaceholderSvg(480, 240);
  assert.ok(!/owner|ownerId|elements|bind|http(?!:\/\/www\.w3)/.test(svg));
});
