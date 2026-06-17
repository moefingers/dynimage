import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// Neon over HTTP — works on BOTH the edge and node runtimes (the native
// `pg` TCP driver does not run on edge). Pooled DATABASE_URL for runtime;
// the unpooled/direct URL is only used by drizzle-kit for migrations.
//
// Lazy by design: `neon(url)` throws if DATABASE_URL is missing, and
// `next build` evaluates route modules at build time (before envs may be
// present). So we defer construction to first use via a Proxy — importing
// this module never touches the env, only actually querying does.

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

function init(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Provision Neon (Vercel Marketplace) and pull " +
        "the pooled connection string into the environment.",
    );
  }
  const sql = neon(url);
  _db = drizzle(sql, { schema });
  return _db;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = _db ?? init();
    return Reflect.get(real as object, prop, receiver);
  },
});

export { schema };
