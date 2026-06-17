import { test } from "node:test";
import assert from "node:assert/strict";
import { getPreset, allPresets } from "./presets.ts";

// Loosely-typed element lookup — the test asserts on knobs/bind whose
// static types are intentionally open (Record<string, unknown> | Bind).
function el(
  scene: ReturnType<NonNullable<ReturnType<typeof getPreset>>["build"]>,
  id: string,
) {
  const found = scene.elements.find((e) => e.id === id);
  assert.ok(found, `element "${id}" present`);
  return found as {
    id: string;
    knobs?: Record<string, unknown>;
    bind?: unknown;
  };
}

const subj = (id: string) => ({ kind: "user" as const, id });

// --- registry ----------------------------------------------------------

test("getPreset resolves the three flagships and null for unknown", () => {
  assert.ok(getPreset("commits-orbit"));
  assert.ok(getPreset("typing-orbit"));
  assert.ok(getPreset("syndicate"));
  assert.equal(getPreset("nope"), null); // → route returns 404
  assert.equal(getPreset(""), null);
});

// --- preset → scene ----------------------------------------------------

test("every flagship is user-subject and builds a valid v1 scene", () => {
  for (const p of allPresets()) {
    assert.deepEqual([...p.subjectKinds], ["user"]);
    const scene = p.build({ subject: subj("moefingers") });
    assert.equal(scene.v, 1);
    assert.ok(scene.canvas.w > 0 && scene.canvas.h > 0, `${p.name} canvas`);
    assert.ok(
      scene.elements.length >= 1 && scene.elements.length <= 16,
      `${p.name} element count within Scene bounds`,
    );
    const ids = scene.elements.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, `${p.name} ids unique`);
  }
});

test("commits-orbit binds the headline live and interpolates the handle", () => {
  const scene = getPreset("commits-orbit")!.build({ subject: subj("octocat") });
  assert.deepEqual(el(scene, "headline").bind, {
    provider: "github",
    subject: { kind: "user", id: "octocat" },
    metric: "commits-last-year",
  });
  assert.equal(el(scene, "name").knobs!.text, "@octocat");
});

test("typing-orbit binds the nitrotype metric", () => {
  const scene = getPreset("typing-orbit")!.build({ subject: subj("speedy") });
  assert.deepEqual(el(scene, "headline").bind, {
    provider: "nitrotype",
    subject: { kind: "user", id: "speedy" },
    metric: "avg-wpm",
  });
});

test("theme flows into canvas.theme; default is dark", () => {
  assert.equal(
    getPreset("typing-orbit")!.build({ subject: subj("x") }).canvas.theme,
    "dark",
  );
  assert.equal(
    getPreset("typing-orbit")!.build({ subject: subj("x"), theme: "ocean" })
      .canvas.theme,
    "ocean",
  );
});

test("sample substitutes literal binds (offline preview/proof)", () => {
  const scene = getPreset("commits-orbit")!.build({
    subject: subj("x"),
    sample: { "commits-last-year": "1247" },
  });
  assert.deepEqual(el(scene, "headline").bind, {
    provider: "literal",
    value: "1247",
  });
});

test("preset build is deterministic (stable L1 key material)", () => {
  const params = { subject: subj("mo"), theme: "ember" };
  assert.deepEqual(
    getPreset("syndicate")!.build(params),
    getPreset("syndicate")!.build(params),
  );
});
