CREATE TABLE "deck_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"current_position" integer DEFAULT 0 NOT NULL,
	"ratings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deck_sessions_status_valid" CHECK ("deck_sessions"."status" in ('in_progress', 'completed')),
	CONSTRAINT "deck_sessions_position_valid" CHECK ("deck_sessions"."current_position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "plan_items" DROP CONSTRAINT "plan_items_kind_valid";--> statement-breakpoint
ALTER TABLE "deck_sessions" ADD CONSTRAINT "deck_sessions_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_sessions" ADD CONSTRAINT "deck_sessions_set_space_fk" FOREIGN KEY ("set_id","space_id") REFERENCES "public"."study_sets"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deck_sessions_one_in_progress" ON "deck_sessions" USING btree ("set_id","student_id") WHERE "deck_sessions"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "deck_sessions_student_id_idx" ON "deck_sessions" USING btree ("student_id");--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_card_shape" CHECK ("learning_items"."kind" = 'mcq' or ("learning_items"."answer_text" is not null and ("learning_items"."kind" <> 'short_answer' or coalesce(jsonb_array_length("learning_items"."key_points"), 0) between 2 and 4)));--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_kind_valid" CHECK ("plan_items"."kind" in ('own', 'practise_topic', 'review_mistakes', 'resume_quiz', 'review_topics', 'practise_deck'));