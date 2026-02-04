CREATE TABLE "segment_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_id" uuid NOT NULL,
	"parent_id" uuid,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source_word_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "target_word_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "segment_comments" ADD CONSTRAINT "segment_comments_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_comments" ADD CONSTRAINT "segment_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_comments" ADD CONSTRAINT "segment_comments_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_segment_comments_segment" ON "segment_comments" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "idx_segment_comments_parent" ON "segment_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_segment_comments_user" ON "segment_comments" USING btree ("user_id");