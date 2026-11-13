CREATE TABLE "item_sources" (
	"space_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	CONSTRAINT "item_sources_item_id_chunk_id_pk" PRIMARY KEY("item_id","chunk_id")
);
--> statement-breakpoint
CREATE TABLE "learning_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"position" integer NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb,
	"correct_index" smallint,
	"answer_text" text,
	"key_points" jsonb,
	"explanation" text,
	"difficulty" text,
	"normalized_prompt" text NOT NULL,
	"prompt_version" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_items_id_space_id_unique" UNIQUE("id","space_id"),
	CONSTRAINT "learning_items_id_space_id_set_id_unique" UNIQUE("id","space_id","set_id"),
	CONSTRAINT "learning_items_set_id_position_unique" UNIQUE("set_id","position"),
	CONSTRAINT "learning_items_kind_valid" CHECK ("learning_items"."kind" in ('mcq', 'recall', 'short_answer')),
	CONSTRAINT "learning_items_status_valid" CHECK ("learning_items"."status" in ('active', 'removed')),
	CONSTRAINT "learning_items_mcq_shape" CHECK ("learning_items"."kind" <> 'mcq' or (jsonb_array_length("learning_items"."options") = 4 and "learning_items"."correct_index" between 0 and 3)),
	CONSTRAINT "learning_items_difficulty_valid" CHECK ("learning_items"."difficulty" is null or "learning_items"."difficulty" in ('easy', 'medium', 'hard'))
);
--> statement-breakpoint
CREATE TABLE "study_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"card_style" text,
	"material_ids" uuid[] NOT NULL,
	"topic_ids" uuid[] NOT NULL,
	"requested_count" integer NOT NULL,
	"generated_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_sets_id_space_id_unique" UNIQUE("id","space_id"),
	CONSTRAINT "study_sets_kind_valid" CHECK ("study_sets"."kind" in ('quiz', 'deck')),
	CONSTRAINT "study_sets_status_valid" CHECK ("study_sets"."status" in ('generating', 'ready', 'failed')),
	CONSTRAINT "study_sets_card_style_valid" CHECK ("study_sets"."card_style" is null or "study_sets"."card_style" in ('recall', 'short_answer', 'mix'))
);
--> statement-breakpoint
ALTER TABLE "item_sources" ADD CONSTRAINT "item_sources_item_space_fk" FOREIGN KEY ("item_id","space_id") REFERENCES "public"."learning_items"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_sources" ADD CONSTRAINT "item_sources_chunk_space_fk" FOREIGN KEY ("chunk_id","space_id") REFERENCES "public"."chunks"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_set_space_fk" FOREIGN KEY ("set_id","space_id") REFERENCES "public"."study_sets"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_topic_space_fk" FOREIGN KEY ("topic_id","space_id") REFERENCES "public"."topics"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sets" ADD CONSTRAINT "study_sets_space_id_study_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."study_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_sources_chunk_id_idx" ON "item_sources" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "learning_items_topic_id_idx" ON "learning_items" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "study_sets_space_id_kind_idx" ON "study_sets" USING btree ("space_id","kind");