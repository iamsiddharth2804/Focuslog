ALTER TABLE "users" ADD COLUMN "long_break_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "long_break_every" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auto_start_breaks" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auto_start_focus" boolean DEFAULT false NOT NULL;