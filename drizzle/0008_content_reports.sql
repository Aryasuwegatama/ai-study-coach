CREATE TABLE "content_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"comment" text,
	"removed_from_practice" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_reports_reporter_id_item_id_unique" UNIQUE("reporter_id","item_id"),
	CONSTRAINT "content_reports_reason_valid" CHECK ("content_reports"."reason" in ('incorrect_answer', 'unclear_wording', 'wrong_source', 'other'))
);
--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_item_space_fk" FOREIGN KEY ("item_id","space_id") REFERENCES "public"."learning_items"("id","space_id") ON DELETE cascade ON UPDATE no action;