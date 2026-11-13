CREATE TABLE "attempt_items" (
	"attempt_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"option_order" smallint[] NOT NULL,
	"selected_index" smallint,
	"is_correct" boolean,
	"answered_at" timestamp with time zone,
	CONSTRAINT "attempt_items_attempt_id_item_id_pk" PRIMARY KEY("attempt_id","item_id"),
	CONSTRAINT "attempt_items_attempt_id_position_unique" UNIQUE("attempt_id","position"),
	CONSTRAINT "attempt_items_selected_valid" CHECK ("attempt_items"."selected_index" is null or "attempt_items"."selected_index" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"score" integer,
	"total" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "attempts_id_space_id_set_id_unique" UNIQUE("id","space_id","set_id"),
	CONSTRAINT "attempts_status_valid" CHECK ("attempts"."status" in ('in_progress', 'submitted'))
);
--> statement-breakpoint
CREATE TABLE "revision_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_item_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"request_key" text NOT NULL,
	"selected_index" smallint,
	"interval_before" integer NOT NULL,
	"interval_after" integer NOT NULL,
	"due_date_after" date NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revision_events_item_request_key_unique" UNIQUE("revision_item_id","request_key"),
	CONSTRAINT "revision_events_outcome_valid" CHECK ("revision_events"."outcome" in ('correct', 'incorrect', 'again', 'got_it'))
);
--> statement-breakpoint
CREATE TABLE "revision_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"interval_days" integer DEFAULT 1 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revision_items_student_id_item_id_unique" UNIQUE("student_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_items_attempt_fk" FOREIGN KEY ("attempt_id","space_id","set_id") REFERENCES "public"."attempts"("id","space_id","set_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_items" ADD CONSTRAINT "attempt_items_item_fk" FOREIGN KEY ("item_id","space_id","set_id") REFERENCES "public"."learning_items"("id","space_id","set_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_set_space_fk" FOREIGN KEY ("set_id","space_id") REFERENCES "public"."study_sets"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_events" ADD CONSTRAINT "revision_events_revision_item_id_revision_items_id_fk" FOREIGN KEY ("revision_item_id") REFERENCES "public"."revision_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_items" ADD CONSTRAINT "revision_items_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_items" ADD CONSTRAINT "revision_items_item_space_fk" FOREIGN KEY ("item_id","space_id") REFERENCES "public"."learning_items"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_items" ADD CONSTRAINT "revision_items_topic_space_fk" FOREIGN KEY ("topic_id","space_id") REFERENCES "public"."topics"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_items_item_id_idx" ON "attempt_items" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_one_in_progress" ON "attempts" USING btree ("set_id","student_id") WHERE "attempts"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "attempts_student_id_idx" ON "attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "revision_items_student_id_due_date_idx" ON "revision_items" USING btree ("student_id","due_date");