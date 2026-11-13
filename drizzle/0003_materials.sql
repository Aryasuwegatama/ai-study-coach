CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"original_name" text NOT NULL,
	"blob_path" text NOT NULL,
	"file_hash" text,
	"size_bytes" integer,
	"page_count" integer,
	"char_count" integer,
	"status" text DEFAULT 'uploading' NOT NULL,
	"stage" text,
	"progress_done" integer,
	"progress_total" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materials_blob_path_unique" UNIQUE("blob_path"),
	CONSTRAINT "materials_space_id_file_hash_unique" UNIQUE("space_id","file_hash"),
	CONSTRAINT "materials_id_space_id_unique" UNIQUE("id","space_id"),
	CONSTRAINT "materials_status_valid" CHECK ("materials"."status" in ('uploading', 'processing', 'review_topics', 'ready', 'failed')),
	CONSTRAINT "materials_stage_valid" CHECK ("materials"."stage" is null or "materials"."stage" in ('verify', 'extract', 'embed', 'suggest_topics')),
	CONSTRAINT "materials_error_code_valid" CHECK ("materials"."error_code" is null or "materials"."error_code" in ('NO_READABLE_TEXT', 'TOO_MANY_PAGES', 'TOO_MUCH_TEXT', 'AI_UNUSABLE_ANSWER', 'PROCESSING_FAILED')),
	CONSTRAINT "materials_original_name_length" CHECK (char_length("materials"."original_name") between 1 and 255)
);
--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_space_id_study_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."study_spaces"("id") ON DELETE cascade ON UPDATE no action;