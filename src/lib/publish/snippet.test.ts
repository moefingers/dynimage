import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnippet, embedUrl } from "./snippet.ts";

const BASE = "https://dynimage.vercel.app";

test("embedUrl builds /i/<id>.<fmt>, omitting empty theme/cb", () => {
  // theme is supported (overrides / future Adaptive) but normally omitted
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
  assert.equal(
    embedUrl({ baseUrl: BASE, id: "abc", format: "svg", cb: "z9" }),
    `${BASE}/i/abc.svg?cb=z9`,
  );
  assert.equal(
    embedUrl({ baseUrl: BASE, id: "abc", format: "svg" }),
    `${BASE}/i/abc.svg`,
  );
});

test("buildSnippet emits a single themed <a><img> — no <picture>, no theme=", () => {
  const s = buildSnippet({ id: "Xy_9-Z", baseUrl: BASE, cb: "abc" });
  assert.match(s, /^<a href="https:\/\/dynimage\.vercel\.app">/);
  assert.ok(!/<picture>/.test(s), "no <picture> split");
  assert.ok(!/<source/.test(s), "no media <source>s");
  assert.ok(
    !/theme=/.test(s),
    "the stored config theme is authoritative — never append ?theme=",
  );
  assert.match(
    s,
    /^<a href="[^"]+">\n  <img src="[^"]*\/i\/Xy_9-Z\.svg\?cb=abc" alt="dynimage embed" \/>\n<\/a>$/,
  );
});

test("buildSnippet honors href and alt", () => {
  const s = buildSnippet({
    id: "id1",
    baseUrl: BASE,
    href: "https://github.com/moefingers",
    alt: "commits-orbit — dynimage",
  });
  assert.match(s, /<a href="https:\/\/github\.com\/moefingers">/);
  assert.match(s, /alt="commits-orbit — dynimage"/);
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
