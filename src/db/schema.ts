import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ───────────────────────── Enums ───────────────────────── */

export const activityTypeEnum = pgEnum("activity_type", ["FOCUS", "BREAK", "PHONE", "OTHER"]);
export const dailySessionStatusEnum = pgEnum("daily_session_status", ["ACTIVE", "PAUSED", "ENDED"]);
export const taskStatusEnum = pgEnum("task_status", ["TODO", "IN_PROGRESS", "DONE"]);
export const taskPriorityEnum = pgEnum("task_priority", ["LOW", "MEDIUM", "HIGH"]);
export const resourceTypeEnum = pgEnum("resource_type", [
  "COURSE",
  "YOUTUBE",
  "DOCUMENTATION",
  "WEBSITE",
  "BOOK",
  "NOTES",
  "OTHER",
]);
export const goalTypeEnum = pgEnum("goal_type", ["DAILY", "WEEKLY", "SUBJECT_WEEKLY"]);
/** Where an activity record came from. MOBILE is reserved for the future phone companion app. */
export const activitySourceEnum = pgEnum("activity_source", ["WEB", "MOBILE", "MANUAL"]);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => ts("created_at").notNull().defaultNow();

/* ───────────────────────── Auth ───────────────────────── */

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    googleId: text("google_id"),
    avatarUrl: text("avatar_url"),
    timezone: text("timezone").notNull().default("UTC"),
    defaultFocusMinutes: integer("default_focus_minutes").notNull().default(25),
    defaultBreakMinutes: integer("default_break_minutes").notNull().default(5),
    /** Pomodoro plan: long break length and how many completed focus sessions earn it. */
    longBreakMinutes: integer("long_break_minutes").notNull().default(15),
    longBreakEvery: integer("long_break_every").notNull().default(4),
    autoStartBreaks: boolean("auto_start_breaks").notNull().default(false),
    autoStartFocus: boolean("auto_start_focus").notNull().default(false),
    onboardedAt: ts("onboarded_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    uniqueIndex("users_google_id_unique").on(t.googleId),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    /** SHA-256 of the session token. The raw token only lives in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

/* ───────────────────────── Study management ───────────────────────── */

export const studyAreas = pgTable(
  "study_areas",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon").notNull().default("book-open"),
    color: text("color").notNull().default("#2E5E4E"),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("study_areas_user_name_unique").on(t.userId, sql`lower(${t.name})`)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studyAreaId: uuid("study_area_id")
      .notNull()
      .references(() => studyAreas.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("TODO"),
    priority: taskPriorityEnum("priority").notNull().default("MEDIUM"),
    estimatedMinutes: integer("estimated_minutes"),
    dueDate: date("due_date", { mode: "string" }),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [
    index("tasks_user_idx").on(t.userId),
    index("tasks_area_idx").on(t.studyAreaId),
    index("tasks_completed_idx").on(t.userId, t.completedAt),
  ],
);

export const subtasks = pgTable(
  "subtasks",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    completed: boolean("completed").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [index("subtasks_task_idx").on(t.taskId)],
);

export const resources = pgTable(
  "resources",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studyAreaId: uuid("study_area_id")
      .notNull()
      .references(() => studyAreas.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    url: text("url"),
    type: resourceTypeEnum("type").notNull().default("WEBSITE"),
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [index("resources_area_idx").on(t.studyAreaId)],
);

/* ───────────────────────── Tracking (source of truth) ───────────────────────── */

/** The overall "I'm at the library" container for a day. */
export const dailySessions = pgTable(
  "daily_sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Local calendar date (user's timezone) the session started on. */
    date: date("date", { mode: "string" }).notNull(),
    label: text("label"),
    startedAt: ts("started_at").notNull(),
    endedAt: ts("ended_at"),
    status: dailySessionStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: createdAt(),
  },
  (t) => [
    index("daily_sessions_user_date_idx").on(t.userId, t.date),
    // At most one open (ACTIVE or PAUSED) daily session per user — enforced by the database.
    uniqueIndex("daily_sessions_one_open_per_user")
      .on(t.userId)
      .where(sql`${t.status} <> 'ENDED'`),
  ],
);

/** One row per contiguous block of a single activity type. Never aggregated. */
export const activitySessions = pgTable(
  "activity_sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dailySessionId: uuid("daily_session_id")
      .notNull()
      .references(() => dailySessions.id, { onDelete: "cascade" }),
    studyAreaId: uuid("study_area_id").references(() => studyAreas.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    type: activityTypeEnum("type").notNull(),
    /** e.g. "25/5", "50/10", "open" */
    mode: text("mode"),
    /** Planned length for pomodoro focus/break blocks. Null = open-ended. */
    plannedSeconds: integer("planned_seconds"),
    startedAt: ts("started_at").notNull(),
    endedAt: ts("ended_at"),
    /** Active seconds (pauses excluded). Written when the activity ends; derived from timestamps. */
    durationSeconds: integer("duration_seconds"),
    endReason: text("end_reason"),
    source: activitySourceEnum("source").notNull().default("WEB"),
    /** Free-form label; for future phone sync this holds the app name (e.g. "Instagram"). */
    label: text("label"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_user_started_idx").on(t.userId, t.startedAt),
    index("activity_daily_idx").on(t.dailySessionId),
    index("activity_task_idx").on(t.taskId),
    // At most one running activity per user — prevents two timers across tabs/devices.
    uniqueIndex("activity_one_open_per_user")
      .on(t.userId)
      .where(sql`${t.endedAt} is null`),
  ],
);

/** Pause intervals for either a daily session or an activity. */
export const pauses = pgTable(
  "pauses",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dailySessionId: uuid("daily_session_id").references(() => dailySessions.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id").references(() => activitySessions.id, { onDelete: "cascade" }),
    pausedAt: ts("paused_at").notNull(),
    resumedAt: ts("resumed_at"),
  },
  (t) => [
    index("pauses_activity_idx").on(t.activityId),
    index("pauses_daily_idx").on(t.dailySessionId),
    check(
      "pauses_one_owner",
      sql`(${t.dailySessionId} is not null and ${t.activityId} is null) or (${t.dailySessionId} is null and ${t.activityId} is not null)`,
    ),
  ],
);

/* ───────────────────────── Goals & reflection ───────────────────────── */

export const goals = pgTable(
  "goals",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studyAreaId: uuid("study_area_id").references(() => studyAreas.id, { onDelete: "cascade" }),
    type: goalTypeEnum("type").notNull(),
    targetMinutes: integer("target_minutes").notNull(),
    /** Goals are versioned: changing a target closes the old row so history stays honest. */
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    createdAt: createdAt(),
  },
  (t) => [index("goals_user_idx").on(t.userId, t.type)],
);

export const reflections = pgTable(
  "reflections",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dailySessionId: uuid("daily_session_id")
      .notNull()
      .references(() => dailySessions.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reflections_session_unique").on(t.dailySessionId)],
);

/* ───────────────────────── Relations ───────────────────────── */

export const studyAreaRelations = relations(studyAreas, ({ many }) => ({
  tasks: many(tasks),
  resources: many(resources),
}));
export const taskRelations = relations(tasks, ({ one, many }) => ({
  studyArea: one(studyAreas, { fields: [tasks.studyAreaId], references: [studyAreas.id] }),
  subtasks: many(subtasks),
}));
export const subtaskRelations = relations(subtasks, ({ one }) => ({
  task: one(tasks, { fields: [subtasks.taskId], references: [tasks.id] }),
}));
export const resourceRelations = relations(resources, ({ one }) => ({
  studyArea: one(studyAreas, { fields: [resources.studyAreaId], references: [studyAreas.id] }),
}));

export type User = typeof users.$inferSelect;
export type StudyArea = typeof studyAreas.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Subtask = typeof subtasks.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type DailySession = typeof dailySessions.$inferSelect;
export type ActivitySession = typeof activitySessions.$inferSelect;
export type Pause = typeof pauses.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Reflection = typeof reflections.$inferSelect;
export type ActivityType = (typeof activityTypeEnum.enumValues)[number];
