import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SYNDICATE_LATTICE_PATH_A,
  SYNDICATE_LATTICE_PATH_B,
  SYNDICATE_SET_TURNS,
  syndicateSet,
  syndicateStarPath,
  syndicateStarVertices,
} from "./syndicate-lattice.ts";

// The brand paths as lists of corners per subpath, centred on the
// lattice centre (150, 150). They use only M, L, l and z.
function corners(d: string): [number, number][][] {
  const toks = d.match(/[MLlz]|-?\d*\.?\d+/g) ?? [];
  const subs: [number, number][][] = [];
  let cur: [number, number][] = [];
  let cmd = "";
  let x = 0;
  let y = 0;
  for (let i = 0; i < toks.length; ) {
    const t = toks[i]!;
    if (/^[MLlz]$/.test(t)) {
      cmd = t;
      i++;
      if (t === "z") {
        subs.push(cur);
        cur = [];
      }
      continue;
    }
    const a = Number(toks[i]);
    const b = Number(toks[i + 1]);
    i += 2;
    if (cmd === "l") {
      x += a;
      y += b;
    } else {
      x = a;
      y = b;
      if (cmd === "M") cur = [];
      cmd = cmd === "M" ? "L" : cmd;
    }
    cur.push([x - 150, y - 150]);
  }
  if (cur.length) subs.push(cur);
  // Drop a closing corner that repeats the first.
  return subs.map((s) => {
    const [f, l] = [s[0]!, s[s.length - 1]!];
    return Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.01 ? s.slice(0, -1) : s;
  });
}

const gap = (p: [number, number], list: [number, number][]) =>
  Math.min(...list.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));

for (const [name, d, turn] of [
  ["A", SYNDICATE_LATTICE_PATH_A, SYNDICATE_SET_TURNS.a],
  ["B", SYNDICATE_LATTICE_PATH_B, SYNDICATE_SET_TURNS.b],
] as const) {
  test(`set ${name}: the stars redraw the brand path exactly`, () => {
    const theirs = corners(d);
    const ours = syndicateSet(turn).map((s) =>
      syndicateStarVertices(s.x, s.y, s.turn),
    );
    assert.equal(theirs.length, 13, "13 stars in the path");
    assert.equal(ours.length, 13, "13 stars redrawn");
    const all = ours.flat();
    const flat = theirs.flat();
    // Every corner of the path is a corner of a redrawn star, and the
    // other way round, to within 0.01 of the 300-unit frame.
    assert.ok(Math.max(...flat.map((p) => gap(p, all))) < 0.01);
    assert.ok(Math.max(...all.map((p) => gap(p, flat))) < 0.01);
  });
}

test("the star path is one closed 12-point star", () => {
  const d = syndicateStarPath();
  assert.match(d, /^M[^MZ]+Z$/);
  assert.equal(d.slice(1, -1).trim().split(/\s+/).length, 48);
});
