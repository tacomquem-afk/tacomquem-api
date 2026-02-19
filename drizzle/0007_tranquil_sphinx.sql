ALTER TABLE "users" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "parental_consent_status" varchar(50) DEFAULT 'not_applicable' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "parental_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "parental_name" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "parental_consent_token" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "parental_consent_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "parental_consent_confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "parental_consent_ip_address" varchar(45);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "parental_consent_user_agent" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_parental_consent_token_unique" UNIQUE("parental_consent_token");