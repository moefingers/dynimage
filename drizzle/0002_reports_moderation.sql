CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"published_id" text NOT NULL,
	"reason" text NOT NULL,
	"reporter_ip_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "published_embeds" ADD COLUMN "flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_published_id_published_embeds_id_fk" FOREIGN KEY ("published_id") REFERENCES "public"."published_embeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_published_idx" ON "reports" USING btree ("published_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_dedupe_idx" ON "reports" USING btree ("published_id","reporter_ip_hash");