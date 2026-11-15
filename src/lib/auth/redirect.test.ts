import { test } from "node:test";
import assert from "node:assert/strict";

import { REDIRECT_MAX_CHARS, safeRedirect } from "./redirect.ts";

const ORIGIN = "https://dynimage.vercel.app";

test("keeps a root-relative path", () => {
  assert.equal(
    safeRedirect("/editor?draft=1#top", ORIGIN),
    "/editor?draft=1#top",
  );
  assert.equal(safeRedirect("/account", undefined), "/account");
});

test("keeps a same-origin absolute URL as its path", () => {
  assert.equal(safeRedirect(`${ORIGIN}/account?x=1`, ORIGIN), "/account?x=1");
});

test("refuses off-site and protocol-relative targets", () => {
  assert.equal(safeRedirect("https://evil.example/x", ORIGIN), "/account");
  assert.equal(safeRedirect("//evil.example/x", ORIGIN), "/account");
  // Without the page's origin (server render), only root-relative paths pass.
  assert.equal(safeRedirect(`${ORIGIN}/account`), "/account");
});

test("refuses backslash and control-character tricks that parse as another host", () => {
  // `?redirect=/%5Cevil.com` and `?redirect=/%09/evil.com` arrive decoded.
  for (const raw of [
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\\/evil.com",
  ]) {
    assert.equal(safeRedirect(raw, ORIGIN), "/account", JSON.stringify(raw));
    assert.equal(safeRedirect(raw), "/account", JSON.stringify(raw));
  }
  // Still-encoded escapes stay a path on this site.
  assert.equal(safeRedirect("/%09/evil.com", ORIGIN), "/%09/evil.com");
});

test("refuses dot segments that resolve to a protocol-relative host", () => {
  for (const raw of [
    "/..//evil.com",
    "/.//evil.com",
    "/%2e%2e//evil.com",
    "/editor/..//evil.com?x",
    "https://dynimage.vercel.app/..//evil.com",
    "..//evil.com",
  ]) {
    assert.equal(safeRedirect(raw, ORIGIN), "/account", raw);
    assert.equal(safeRedirect(raw), "/account", raw);
  }
});

test("never returns anything but /account or a path on this site (seeded fuzz)", () => {
  const parts = [
    "/",
    "//",
    "..",
    ".",
    "%2e",
    "%2E",
    "%2f",
    "%5c",
    "evil.com",
    "@",
    "?",
    "#",
    ":",
    "a",
    "%",
    "[::1]",
    "https:",
    "é",
    " ",
    "~",
  ];
  let seed = 0x9e3779b9;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 2 ** 32;
  };
  for (let i = 0; i < 20_000; i++) {
    let raw = "";
    const n = 1 + Math.floor(next() * 8);
    for (let j = 0; j < n; j++) raw += parts[Math.floor(next() * parts.length)];
    for (const origin of [ORIGIN, undefined]) {
      const out = safeRedirect(raw, origin);
      if (out === "/account") continue;
      assert.ok(
        out.startsWith("/") && !out.startsWith("//"),
        `${raw} -> ${out}`,
      );
      assert.equal(new URL(out, ORIGIN).origin, ORIGIN, `${raw} -> ${out}`);
      assert.equal(
        JSON.stringify(out).length,
        out.length + 2,
        `${raw} -> ${out}`,
      );
    }
  }
});

test("falls back to /account for a sandboxed page's null origin", () => {
  assert.equal(safeRedirect("/account?x=1", "null"), "/account");
});

test("falls back to /account for no redirect", () => {
  assert.equal(safeRedirect(null, ORIGIN), "/account");
  assert.equal(safeRedirect("", ORIGIN), "/account");
});

test("keeps the editor's whole-scene target, and its path alone past the cap", () => {
  const scene = "A".repeat(1_900);
  assert.equal(
    safeRedirect(`/editor?s=${scene}`, ORIGIN),
    `/editor?s=${scene}`,
  );
  const atCap = "/editor?s=" + "A".repeat(REDIRECT_MAX_CHARS - 10);
  assert.equal(atCap.length, REDIRECT_MAX_CHARS);
  assert.equal(safeRedirect(atCap, ORIGIN), atCap);
  assert.equal(safeRedirect(atCap + "A", ORIGIN), "/editor");
});

test("returns plain ASCII that JSON carries one byte per character", () => {
  const raw = '/café/"quoted"?q=☃ "x"#frag "y"';
  const target = safeRedirect(raw, ORIGIN);
  assert.match(target, /^\/[\x21-\x7e]*$/);
  assert.ok(!target.includes('"') && !target.includes("\\"));
  assert.equal(JSON.stringify(target).length, target.length + 2);
});
