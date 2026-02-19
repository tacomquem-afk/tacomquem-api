CREATE TABLE "beta_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"added_by" uuid NOT NULL,
	"reason" text,
	"ip_address" varchar(45),
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "beta_invites_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "beta_invites" ADD CONSTRAINT "beta_invites_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;