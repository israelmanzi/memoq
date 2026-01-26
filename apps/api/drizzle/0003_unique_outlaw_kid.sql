ALTER TABLE "documents" ADD COLUMN "file_storage_key" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "structure_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "page_count" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "is_binary_format" boolean DEFAULT false NOT NULL;