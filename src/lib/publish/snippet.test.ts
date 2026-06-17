import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnippet, embedUrl } from "./snippet.ts";

const BASE = "https://dynimage.vercel.app";

test("embedUrl builds /i/<id>.<fmt> with theme + cb query", () => {
  assert.equal(
    embedUrl({
      baseUrl: BASE,
      id: "abc",
      format: "svg",
      theme: "dark",
      cb: "z9",
    }),
    `${BASE}/i/abc.svg?theme=dark&cb=z9`,
  );
  // no theme, no cb → bare URL (the <img> fallback)
  assert.equal(
    embedUrl({ baseUrl: BASE, id: "abc", format: "svg" }),
    `${BASE}/i/abc.svg`,
  );
});

test("buildSnippet wraps a theme-split <picture> in an <a>", () => {
  const s = buildSnippet({ id: "Xy_9-Z", baseUrl: BASE, cb: "abc" });
  assert.match(s, /^<a href="https:\/\/dynimage\.vercel\.app">/);
  assert.match(s, /<picture>/);
  assert.match(
    s,
    /<source media="\(prefers-color-scheme: dark\)" srcset="[^"]*theme=dark[^"]*" \/>/,
  );
  assert.match(
    s,
    /<source media="\(prefers-color-scheme: light\)" srcset="[^"]*theme=light[^"]*" \/>/,
  );
  assert.match(
    s,
    /<img src="[^"]*\/i\/Xy_9-Z\.svg\?cb=abc" alt="dynimage embed" \/>/,
  );
  assert.match(s, /<\/picture>\n<\/a>$/);
});

test("buildSnippet honors href, alt, and custom themes", () => {
  const s = buildSnippet({
    id: "id1",
    baseUrl: BASE,
    href: "https://github.com/moefingers",
    alt: "moefingers' commits",
    themes: { dark: "ember", light: "rose" },
  });
  assert.match(s, /<a href="https:\/\/github\.com\/moefingers">/);
  assert.match(s, /theme=ember/);
  assert.match(s, /theme=rose/);
  assert.match(s, /alt="moefingers&#39;? commits"|alt="moefingers' commits"/);
});

test("buildSnippet escapes HTML-significant chars in alt/href", () => {
  const s = buildSnippet({
    id: "id1",
    baseUrl: BASE,
    alt: 'a"<b>&',
    href: 'https://x.test/?a=1&b="2"',
  });
  assert.ok(!/alt="a"<b>&"/.test(s), "raw quote/angle/amp must be escaped");
  assert.match(s, /alt="a&quot;&lt;b&gt;&amp;"/);
  assert.match(s, /href="https:\/\/x\.test\/\?a=1&amp;b=&quot;2&quot;"/);
});

test("buildSnippet points at the chosen format", () => {
  const s = buildSnippet({ id: "id1", baseUrl: BASE, format: "png" });
  assert.match(s, /\/i\/id1\.png/);
  assert.ok(!/\.svg/.test(s));
});
