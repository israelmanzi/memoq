ALTER TABLE "users" ADD COLUMN "mfa_reset_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_reset_expires" timestamp with time zone;