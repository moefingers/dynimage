import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { dirname, resolve as rp } from "node:path";
const exts = [".ts", ".tsx", ".js", ".mjs", ".json"];
function probe(b) {
  for (const e of exts) if (existsSync(b + e)) return b + e;
  for (const e of exts) {
    const i = rp(b, "index" + e);
    if (existsSync(i)) return i;
  }
  return existsSync(b) ? b : null;
}
export async function resolve(s, c, n) {
  let t = null;
  if (s.startsWith("@/")) t = rp(process.cwd(), "src", s.slice(2));
  else if (
    (s.startsWith("./") || s.startsWith("../")) &&
    c.parentURL &&
    !/\.(ts|tsx|js|mjs|cjs|json)$/.test(s)
  )
    t = rp(dirname(fileURLToPath(c.parentURL)), s);
  if (t) {
    const f = probe(t);
    if (f) return n(pathToFileURL(f).href, c);
  }
  return n(s, c);
}
