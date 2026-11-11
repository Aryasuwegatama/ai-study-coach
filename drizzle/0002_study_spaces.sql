CREATE TABLE "study_spaces" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "study_spaces_name_length" CHECK (char_length("study_spaces"."name") between 1 and 150)
);
--> statement-breakpoint
ALTER TABLE "study_spaces" ADD CONSTRAINT "study_spaces_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_spaces_owner_id_idx" ON "study_spaces" USING btree ("owner_id");