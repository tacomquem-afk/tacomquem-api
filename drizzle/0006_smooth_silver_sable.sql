CREATE TYPE "public"."deletion_status" AS ENUM('active', 'pending', 'scheduled', 'completed');--> statement-breakpoint
CREATE TABLE "access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp NOT NULL,
	"ip_address" varchar(45),
	"user_id" uuid,
	"http_method" varchar(10) NOT NULL,
	"path" varchar(500) NOT NULL,
	"query_string" varchar(500),
	"status_code" integer,
	"response_time_ms" integer,
	"user_agent" text,
	"referrer" varchar(500),
	"body_hash" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"format" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"file_url" varchar(255),
	"file_size_bytes" integer,
	"download_token" varchar(255),
	"download_token_expires_at" timestamp,
	"downloaded_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "data_exports_download_token_unique" UNIQUE("download_token")
);
--> statement-breakpoint
CREATE TABLE "deletion_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deletion_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_scheduled_for" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_status" "deletion_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_tokens" ADD CONSTRAINT "deletion_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_access_logs_user_id_timestamp" ON "access_logs" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_access_logs_timestamp" ON "access_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_access_logs_created_at" ON "access_logs" USING btree ("created_at");