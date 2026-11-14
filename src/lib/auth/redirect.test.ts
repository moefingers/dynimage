import { test } from "node:test";
import assert from "node:assert/strict";

import { REDIRECT_MAX_CHARS, safeRedirect } from "./redirect.ts";

const ORIGIN = "https://dynimage.vercel.app";

test("keeps a root-relative path", () => {
  assert.equal(
    safeRedirect("/editor?draft=1#top", ORIGIN),
    "/editor?draft=1#top",
  );
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

test("falls back to /account for no redirect", () => {
  assert.equal(safeRedirect(null, ORIGIN), "/account");
  assert.equal(safeRedirect("", ORIGIN), "/account");
});

test("keeps a redirect of exactly the cap and refuses one character more", () => {
  const atCap = "/" + "a".repeat(REDIRECT_MAX_CHARS - 1);
  assert.equal(safeRedirect(atCap, ORIGIN), atCap);
  assert.equal(safeRedirect(atCap + "a", ORIGIN), "/account");
});
