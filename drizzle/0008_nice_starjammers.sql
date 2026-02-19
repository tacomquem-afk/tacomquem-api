ALTER TABLE "users" ADD COLUMN "terms_version" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_ip" varchar(45);