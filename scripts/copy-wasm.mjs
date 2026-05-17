// Copy the resvg wasm binary into public/ so the Edge streak renderer
// can fetch it from a stable URL at runtime. Avoids bundler-specific
// `?module` import shenanigans and works the same in dev and prod.
import { mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const src = resolve("node_modules/@resvg/resvg-wasm/index_bg.wasm");
const dst = resolve("public/wasm/resvg.wasm");
await mkdir(dirname(dst), { recursive: true });
await copyFile(src, dst);
console.log(`copy-wasm: ${src} -> ${dst}`);
