CREATE TABLE "material_topics" (
	"space_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"pages" integer[] DEFAULT '{}'::integer[] NOT NULL,
	CONSTRAINT "material_topics_material_id_topic_id_pk" PRIMARY KEY("material_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"origin" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_id_space_id_unique" UNIQUE("id","space_id"),
	CONSTRAINT "topics_status_valid" CHECK ("topics"."status" in ('draft', 'confirmed', 'archived')),
	CONSTRAINT "topics_origin_valid" CHECK ("topics"."origin" in ('ai', 'manual')),
	CONSTRAINT "topics_name_length" CHECK (char_length("topics"."name") between 1 and 60),
	CONSTRAINT "topics_description_length" CHECK (char_length("topics"."description") <= 200)
);
--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_topics" ADD CONSTRAINT "material_topics_material_space_fk" FOREIGN KEY ("material_id","space_id") REFERENCES "public"."materials"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_topics" ADD CONSTRAINT "material_topics_topic_space_fk" FOREIGN KEY ("topic_id","space_id") REFERENCES "public"."topics"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_space_id_study_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."study_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_topics_topic_id_idx" ON "material_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topics_space_confirmed_name_unique" ON "topics" USING btree ("space_id","normalized_name") WHERE "topics"."status" = 'confirmed';--> statement-breakpoint
CREATE INDEX "ai_calls_purpose_created_at_idx" ON "ai_calls" USING btree ("purpose","created_at");