import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEmbedPath } from "./path.ts";

test("parses <id>.<ext> into id + format", () => {
  assert.deepEqual(parseEmbedPath("Xy_9-Z.png"), {
    id: "Xy_9-Z",
    format: "png",
  });
  for (const ext of ["svg", "png", "webp", "avif"]) {
    assert.deepEqual(parseEmbedPath(`abc.${ext}`), { id: "abc", format: ext });
  }
});

test("bare id (no extension) defaults to svg", () => {
  assert.deepEqual(parseEmbedPath("Xy_9-Z"), { id: "Xy_9-Z", format: "svg" });
});

test("base64url ids (with - and _) survive parsing", () => {
  // genId output alphabet: A-Za-z0-9-_
  assert.deepEqual(parseEmbedPath("a-b_c-D9.svg"), {
    id: "a-b_c-D9",
    format: "svg",
  });
});

test("rejects unknown extensions and illegal id chars", () => {
  assert.equal(parseEmbedPath("abc.gif"), null);
  assert.equal(parseEmbedPath("ab/cd.svg"), null);
  assert.equal(parseEmbedPath("ab cd"), null);
  assert.equal(parseEmbedPath(""), null);
  assert.equal(parseEmbedPath("."), null);
});

test("does not split on a non-final dot (ids never contain dots)", () => {
  // "a.b.svg" — id "a" with a stray ".b" is not a valid base64url id, so
  // the whole thing must fail rather than mis-parse.
  assert.equal(parseEmbedPath("a.b.svg"), null);
});
