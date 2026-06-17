CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential_vault" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"wrapped_data_key" text NOT NULL,
	"key_version" integer NOT NULL,
	"last4" text,
	"scopes" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"user_id" text PRIMARY KEY NOT NULL,
	"tier" text DEFAULT 'full' NOT NULL,
	"rate_budget_per_hour" integer,
	"max_published" integer,
	"max_assets" integer,
	"private_data_allowed" boolean DEFAULT true NOT NULL,
	"badge_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "published_embeds" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"config" jsonb NOT NULL,
	"exposes_private_data" boolean DEFAULT false NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"bucket" timestamp NOT NULL,
	"ledger" text NOT NULL,
	"token_source" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_vault" ADD CONSTRAINT "credential_vault_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_embeds" ADD CONSTRAINT "published_embeds_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credential_vault_user_provider_idx" ON "credential_vault" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "credential_vault_user_provider_label_idx" ON "credential_vault" USING btree ("user_id","provider","label");--> statement-breakpoint
CREATE INDEX "published_embeds_owner_idx" ON "published_embeds" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_ledger_unique_idx" ON "usage_ledger" USING btree ("owner_id","bucket","ledger","token_source");--> statement-breakpoint
CREATE INDEX "usage_ledger_owner_idx" ON "usage_ledger" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");