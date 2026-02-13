CREATE TABLE "friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_a_id" uuid NOT NULL,
	"user_b_id" uuid NOT NULL,
	"origin_loan_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_distinct_users_check" CHECK ("friendships"."user_a_id" <> "friendships"."user_b_id")
);
--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_origin_loan_id_loans_id_fk" FOREIGN KEY ("origin_loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_user_pair_unique" ON "friendships" USING btree (LEAST("user_a_id", "user_b_id"),GREATEST("user_a_id", "user_b_id"));
--> statement-breakpoint
INSERT INTO "friendships" ("user_a_id", "user_b_id", "origin_loan_id", "created_at", "updated_at")
SELECT
	LEAST("lender_id", "borrower_id"),
	GREATEST("lender_id", "borrower_id"),
	(array_agg("id" ORDER BY "created_at"))[1],
	now(),
	now()
FROM "loans"
WHERE "borrower_id" IS NOT NULL
	AND "status" IN ('confirmed', 'returned')
	AND "lender_id" <> "borrower_id"
GROUP BY LEAST("lender_id", "borrower_id"), GREATEST("lender_id", "borrower_id")
ON CONFLICT DO NOTHING;
