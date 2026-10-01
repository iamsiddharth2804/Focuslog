CREATE TYPE "public"."activity_source" AS ENUM('WEB', 'MOBILE', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('FOCUS', 'BREAK', 'PHONE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."daily_session_status" AS ENUM('ACTIVE', 'PAUSED', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."goal_type" AS ENUM('DAILY', 'WEEKLY', 'SUBJECT_WEEKLY');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('COURSE', 'YOUTUBE', 'DOCUMENTATION', 'WEBSITE', 'BOOK', 'NOTES', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('TODO', 'IN_PROGRESS', 'DONE');--> statement-breakpoint
CREATE TABLE "activity_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"daily_session_id" uuid NOT NULL,
	"study_area_id" uuid,
	"task_id" uuid,
	"type" "activity_type" NOT NULL,
	"mode" text,
	"planned_seconds" integer,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"end_reason" text,
	"source" "activity_source" DEFAULT 'WEB' NOT NULL,
	"label" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"label" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"status" "daily_session_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"study_area_id" uuid,
	"type" "goal_type" NOT NULL,
	"target_minutes" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"daily_session_id" uuid,
	"activity_id" uuid,
	"paused_at" timestamp with time zone NOT NULL,
	"resumed_at" timestamp with time zone,
	CONSTRAINT "pauses_one_owner" CHECK (("pauses"."daily_session_id" is not null and "pauses"."activity_id" is null) or ("pauses"."daily_session_id" is null and "pauses"."activity_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "reflections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"daily_session_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"study_area_id" uuid NOT NULL,
	"task_id" uuid,
	"title" text NOT NULL,
	"url" text,
	"type" "resource_type" DEFAULT 'WEBSITE' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'book-open' NOT NULL,
	"color" text DEFAULT '#2E5E4E' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subtasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"name" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"study_area_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'TODO' NOT NULL,
	"priority" "task_priority" DEFAULT 'MEDIUM' NOT NULL,
	"estimated_minutes" integer,
	"due_date" date,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"google_id" text,
	"avatar_url" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"default_focus_minutes" integer DEFAULT 25 NOT NULL,
	"default_break_minutes" integer DEFAULT 5 NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_daily_session_id_daily_sessions_id_fk" FOREIGN KEY ("daily_session_id") REFERENCES "public"."daily_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_study_area_id_study_areas_id_fk" FOREIGN KEY ("study_area_id") REFERENCES "public"."study_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_sessions" ADD CONSTRAINT "activity_sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_sessions" ADD CONSTRAINT "daily_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_study_area_id_study_areas_id_fk" FOREIGN KEY ("study_area_id") REFERENCES "public"."study_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pauses" ADD CONSTRAINT "pauses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pauses" ADD CONSTRAINT "pauses_daily_session_id_daily_sessions_id_fk" FOREIGN KEY ("daily_session_id") REFERENCES "public"."daily_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pauses" ADD CONSTRAINT "pauses_activity_id_activity_sessions_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_daily_session_id_daily_sessions_id_fk" FOREIGN KEY ("daily_session_id") REFERENCES "public"."daily_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_study_area_id_study_areas_id_fk" FOREIGN KEY ("study_area_id") REFERENCES "public"."study_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_areas" ADD CONSTRAINT "study_areas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_study_area_id_study_areas_id_fk" FOREIGN KEY ("study_area_id") REFERENCES "public"."study_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_started_idx" ON "activity_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "activity_daily_idx" ON "activity_sessions" USING btree ("daily_session_id");--> statement-breakpoint
CREATE INDEX "activity_task_idx" ON "activity_sessions" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_one_open_per_user" ON "activity_sessions" USING btree ("user_id") WHERE "activity_sessions"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "daily_sessions_user_date_idx" ON "daily_sessions" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_sessions_one_open_per_user" ON "daily_sessions" USING btree ("user_id") WHERE "daily_sessions"."status" <> 'ENDED';--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "pauses_activity_idx" ON "pauses" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "pauses_daily_idx" ON "pauses" USING btree ("daily_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reflections_session_unique" ON "reflections" USING btree ("daily_session_id");--> statement-breakpoint
CREATE INDEX "resources_area_idx" ON "resources" USING btree ("study_area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_areas_user_name_unique" ON "study_areas" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "subtasks_task_idx" ON "subtasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_user_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_area_idx" ON "tasks" USING btree ("study_area_id");--> statement-breakpoint
CREATE INDEX "tasks_completed_idx" ON "tasks" USING btree ("user_id","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_id_unique" ON "users" USING btree ("google_id");