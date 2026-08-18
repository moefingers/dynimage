import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]])
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
register("./.hooks.mjs", pathToFileURL("./"));
