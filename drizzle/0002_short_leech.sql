CREATE TYPE "public"."admin_action" AS ENUM('user_blocked', 'user_unblocked', 'item_removed', 'loan_cancelled', 'admin_created', 'admin_role_changed', 'admin_removed', 'content_flagged');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN');--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" "admin_action" NOT NULL,
	"target_type" varchar(50),
	"target_id" uuid,
	"metadata" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'USER' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blocked_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;