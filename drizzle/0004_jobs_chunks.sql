CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	"embedding" vector(768),
	"embedding_model" text,
	CONSTRAINT "chunks_material_id_chunk_index_unique" UNIQUE("material_id","chunk_index"),
	CONSTRAINT "chunks_id_space_id_unique" UNIQUE("id","space_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"space_id" uuid,
	"kind" text NOT NULL,
	"target_id" uuid,
	"payload" jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"step" text NOT NULL,
	"claim_token" uuid,
	"lease_until" timestamp with time zone,
	"generation_slot_acquired" boolean DEFAULT false NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "jobs_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "jobs_kind_valid" CHECK ("jobs"."kind" in ('process_material', 'generate_quiz', 'generate_deck', 'delete_files')),
	CONSTRAINT "jobs_status_valid" CHECK ("jobs"."status" in ('queued', 'running', 'succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_material_space_fk" FOREIGN KEY ("material_id","space_id") REFERENCES "public"."materials"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_space_id_study_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."study_spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunks_space_id_material_id_idx" ON "chunks" USING btree ("space_id","material_id");--> statement-breakpoint
CREATE INDEX "jobs_user_id_finished_at_idx" ON "jobs" USING btree ("user_id","finished_at");--> statement-breakpoint
CREATE INDEX "jobs_user_id_kind_created_at_idx" ON "jobs" USING btree ("user_id","kind","created_at");