import { defineConfig } from "drizzle-kit";

// drizzle-kit config. `generate` produces SQL migrations from the schema
// OFFLINE (no DB needed) → ./drizzle. `migrate`/`push` need a live DB and
// use the UNPOOLED/direct Neon URL (pooled endpoints don't support the
// session-level operations migrations require).
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
