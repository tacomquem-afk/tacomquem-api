CREATE TYPE "public"."access_tier" AS ENUM('PUBLIC', 'BETA', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."beta_audit_action" AS ENUM('added', 'removed');--> statement-breakpoint
CREATE TABLE "beta_program_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" "beta_audit_action" NOT NULL,
	"reason" text,
	"ip_address" varchar(45),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "access_tier" "access_tier" DEFAULT 'PUBLIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "beta_added_at" timestamp;--> statement-breakpoint
ALTER TABLE "beta_program_audit" ADD CONSTRAINT "beta_program_audit_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_program_audit" ADD CONSTRAINT "beta_program_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;