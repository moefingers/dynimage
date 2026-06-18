import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────
// Better Auth core tables (user / session / account / verification).
// Hand-mirrored from Better Auth's documented Postgres schema so the
// drizzle adapter (see lib/auth/auth.ts) maps cleanly. `account` holds
// OAuth-provider linkages (incl. GitHub OAuth access/refresh tokens) and
// is DISTINCT from our credential vault below — the vault stores
// user-pasted PATs (the power-user fallback), encrypted at rest.
// ─────────────────────────────────────────────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ─────────────────────────────────────────────────────────────────────
// Domain tables (spec §4, §7, §8, §9).
// ─────────────────────────────────────────────────────────────────────

// Entitlements: one row per user. Limits are READ from here, never
// hardcoded (spec §9) — so dialing tiers later is a data change, not a
// migration. Everyone defaults to full access; the ratchet exists in the
// schema from day one but stays wide open until we choose to monetize.
export const entitlements = pgTable("entitlements", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  tier: text("tier").notNull().default("full"),
  // null = unlimited (full access). A number caps the value.
  rateBudgetPerHour: integer("rate_budget_per_hour"),
  maxPublished: integer("max_published"),
  maxAssets: integer("max_assets"),
  privateDataAllowed: boolean("private_data_allowed").notNull().default(true),
  badgeEnabled: boolean("badge_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Per-user, per-provider credential vault (spec §4). Stores the envelope-
// encrypted secret — NEVER plaintext. Columns mirror EncryptedSecret in
// lib/auth/crypto.ts. `label` + last-4 are the only things ever shown to
// a client. Rotation re-wraps the data key (bumps key_version) without
// touching ciphertext.
export const credentialVault = pgTable(
  "credential_vault",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "github" today; generic by design
    label: text("label").notNull(),
    // envelope-encryption columns (see EncryptedSecret)
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    wrappedDataKey: text("wrapped_data_key").notNull(),
    keyVersion: integer("key_version").notNull(),
    // shown to the user so they can identify the token without revealing it
    last4: text("last4"),
    scopes: jsonb("scopes").$type<string[]>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at"),
  },
  (t) => [
    index("credential_vault_user_provider_idx").on(t.userId, t.provider),
    uniqueIndex("credential_vault_user_provider_label_idx").on(
      t.userId,
      t.provider,
      t.label,
    ),
  ],
);

// Published embeds (spec §8). `id` is UNGUESSABLE/random (never
// sequential); /i/<id> resolves to the rendered image only, never this
// config row. Publish lifecycle (transactional + pre-warm) is Phase C —
// this table is schema-ready now so the foundation isn't a blocker.
export const publishedEmbeds = pgTable(
  "published_embeds",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // the internal scene/element config (builder-1 owns its shape)
    config: jsonb("config").notNull(),
    // true if any element binds private data (publish-time disclaimer §8)
    exposesPrivateData: boolean("exposes_private_data").notNull().default(false),
    // Moderation (§11): `flagged` auto-set when reports cross the threshold
    // (queued for review); `disabled` is the admin action → /i/<id> 410s.
    flagged: boolean("flagged").notNull().default(false),
    disabled: boolean("disabled").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("published_embeds_owner_idx").on(t.ownerId)],
);

// Abuse reports (§11). Public, rate-limited POST /api/report → a row here.
// One report per (embed, reporter-IP-hash) — the unique index stops a single
// IP from inflating an id's report count. The raw IP is NEVER stored (hashed
// with a server salt) — just enough to dedupe + threshold.
export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    publishedId: text("published_id")
      .notNull()
      .references(() => publishedEmbeds.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    reporterIpHash: text("reporter_ip_hash").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("reports_published_idx").on(t.publishedId),
    uniqueIndex("reports_dedupe_idx").on(t.publishedId, t.reporterIpHash),
  ],
);

// Durable usage ledger (spec §7). The HOT counters live in Upstash
// (lib/data/usage.ts); this table holds the periodic flush for history /
// future billing. TWO LEDGERS kept separate by `ledger`:
//   - "upstream" = actual GitHub/nitrotype calls = cache MISSES only
//                  (the quota / mercy-ladder meter)
//   - "render"   = render/compute count (the abuse meter; fires on every
//                  render incl. L2 hits)
// `tokenSource` distinguishes app-token vs the owner's own PAT so the
// mercy ladder's "BYO-PAT calls don't burn our quota" is auditable.
//
// NOTE (scout ToS, spec §9): do NOT build a service-token POOL to raise
// the anonymous ceiling — pooling tokens past 5k/hr is the ToS
// gray-to-red move. Correct headroom path if we ever hit the ceiling is a
// GitHub App (installation tokens), not PAT rotation. This is a comment,
// not a Wave-1 build.
export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: text("id").primaryKey(),
    // null owner = anonymous front-line (metered globally, not per-owner)
    ownerId: text("owner_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    bucket: timestamp("bucket").notNull(), // period start (e.g. hour)
    ledger: text("ledger").notNull(), // "upstream" | "render"
    tokenSource: text("token_source").notNull(), // "app" | "pat"
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("usage_ledger_unique_idx").on(
      t.ownerId,
      t.bucket,
      t.ledger,
      t.tokenSource,
    ),
    index("usage_ledger_owner_idx").on(t.ownerId),
  ],
);

// Uploaded assets (§10) — builder-2's lane; schema owned here. The
// logo/image element's uploaded-asset source. Bytes live in Vercel Blob;
// this row is the entity. Raster-only v1 (mime allowlist + size cap enforced
// at the upload route). genId id + owner cascade, mirroring published_embeds.
export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mime: text("mime").notNull(),
    size: integer("size").notNull(), // bytes
    blobUrl: text("blob_url").notNull(), // public Vercel Blob URL
    blobPathname: text("blob_pathname").notNull(), // for delete
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("assets_owner_idx").on(t.ownerId)],
);
