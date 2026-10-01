import { z } from "zod";
import { ACTIVITY_TYPES, RESOURCE_TYPES } from "./constants";
import { PLAN_LIMITS } from "./pomodoro";

const name = z.string().trim().min(1, "is required").max(80);
const optText = z.string().trim().max(2000).optional().nullable();
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const registerSchema = z
  .object({
    name: name,
    email: z.string().trim().toLowerCase().email("is not a valid email"),
    password: z.string().min(8, "must be at least 8 characters").max(200),
    confirmPassword: z.string(),
    timezone: z.string().optional(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "doesn't match" });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  remember: z.boolean().optional().default(true),
});

export const studyAreaSchema = z.object({
  name,
  description: optText,
  icon: z.string().max(40).optional(),
  color: hexColor.optional(),
  weeklyGoalMinutes: z.number().int().min(0).max(10080).optional().nullable(),
});
export const studyAreaPatchSchema = studyAreaSchema.partial().extend({ archived: z.boolean().optional() });

export const taskSchema = z.object({
  studyAreaId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: optText,
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  estimatedMinutes: z.number().int().min(0).max(100000).optional().nullable(),
  dueDate: dateKey.optional().nullable(),
});
export const taskPatchSchema = taskSchema.omit({ studyAreaId: true }).partial();

export const subtaskSchema = z.object({ taskId: z.string().uuid(), name: z.string().trim().min(1).max(200) });
export const subtaskPatchSchema = z.object({ name: z.string().trim().min(1).max(200).optional(), completed: z.boolean().optional() });

export const resourceSchema = z.object({
  studyAreaId: z.string().uuid(),
  taskId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(200),
  url: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null))
    .refine((v) => !v || z.string().url().safeParse(v).success, "is not a valid URL"),
  type: z.enum(RESOURCE_TYPES).optional(),
  description: optText,
});

export const startActivitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES),
  studyAreaId: z.string().uuid().optional().nullable(),
  taskId: z.string().uuid().optional().nullable(),
  mode: z.string().max(32).optional().nullable(),
  plannedMinutes: z.number().int().min(1).max(600).optional().nullable(),
  label: z.string().trim().max(80).optional().nullable(),
  /** Client-side id of the activity it believes is running. Guards against stale tabs. */
  expectedCurrentId: z.string().uuid().optional().nullable(),
  /** When the user clicked (ISO), so the record matches what they saw. */
  at: z.string().datetime().optional(),
});

export const endActivitySchema = z.object({
  activityId: z.string().uuid().optional(),
  reason: z.enum(["COMPLETED", "FINISHED"]).optional(),
  resumePrevious: z.boolean().optional(),
  completeTask: z.boolean().optional(),
  note: z.string().trim().max(1000).optional(),
  /** When the user clicked (ISO), so the record matches what they saw. */
  at: z.string().datetime().optional(),
});

export const activityIdSchema = z.object({ activityId: z.string().uuid().optional(), at: z.string().datetime().optional() });
export const clickSchema = z.object({ at: z.string().datetime().optional() });

export const startDaySchema = z.object({ label: z.string().trim().max(60).optional().nullable() });

export const reflectionSchema = z.object({
  dailySessionId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  note: z.string().trim().max(4000).optional().nullable(),
});

export const goalSchema = z.object({
  type: z.enum(["DAILY", "WEEKLY", "SUBJECT_WEEKLY"]),
  studyAreaId: z.string().uuid().optional().nullable(),
  targetMinutes: z.number().int().min(5).max(10080),
});

export const onboardingSchema = z.object({
  areas: z.array(z.object({ name, color: hexColor.optional(), icon: z.string().optional() })).max(20),
  dailyGoalMinutes: z.number().int().min(15).max(1440),
  weeklyGoalMinutes: z.number().int().min(60).max(10080),
  timezone: z.string().optional(),
});

export const settingsSchema = z.object({
  name: name.optional(),
  avatarUrl: z.string().url().max(2000).optional().nullable().or(z.literal("")),
  timezone: z.string().optional(),
  defaultFocusMinutes: z.number().int().min(PLAN_LIMITS.focus.min).max(PLAN_LIMITS.focus.max).optional(),
  defaultBreakMinutes: z.number().int().min(PLAN_LIMITS.short.min).max(PLAN_LIMITS.short.max).optional(),
  longBreakMinutes: z.number().int().min(PLAN_LIMITS.long.min).max(PLAN_LIMITS.long.max).optional(),
  longBreakEvery: z.number().int().min(PLAN_LIMITS.every.min).max(PLAN_LIMITS.every.max).optional(),
  autoStartBreaks: z.boolean().optional(),
  autoStartFocus: z.boolean().optional(),
  dailyGoalMinutes: z.number().int().min(15).max(1440).optional(),
});

export { dateKey };
