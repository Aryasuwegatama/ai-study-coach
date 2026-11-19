DROP INDEX "revision_items_student_id_due_date_idx";--> statement-breakpoint
ALTER TABLE "revision_items" ADD COLUMN "cleared_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "revision_items_student_id_topic_id_open_idx" ON "revision_items" USING btree ("student_id","topic_id") WHERE "revision_items"."cleared_at" is null;--> statement-breakpoint
ALTER TABLE "revision_events" DROP COLUMN "interval_before";--> statement-breakpoint
ALTER TABLE "revision_events" DROP COLUMN "interval_after";--> statement-breakpoint
ALTER TABLE "revision_events" DROP COLUMN "due_date_after";--> statement-breakpoint
ALTER TABLE "revision_items" DROP COLUMN "due_date";--> statement-breakpoint
ALTER TABLE "revision_items" DROP COLUMN "interval_days";--> statement-breakpoint
ALTER TABLE "revision_items" DROP COLUMN "streak";