import "server-only";
import { invalidateUser } from "@/lib/auth/session";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { activitySessions, dailySessions, goals, reflections, studyAreas, tasks, users, type User } from "@/db/schema";
import { badRequest, notFound } from "@/lib/api";
import { AREA_COLORS, AREA_ICONS, guessIcon } from "@/lib/constants";
import { formatTimeInTz, isValidTimeZone, localDateKey } from "@/lib/time";
import type { onboardingSchema, reflectionSchema, settingsSchema } from "@/lib/validation";
import { setGoal } from "./goals";

export async function completeOnboarding(user: User, input: z.infer<typeof onboardingSchema>) {
  const tz = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : user.timezone;
  await db.update(users).set({ timezone: tz }).where(eq(users.id, user.id));
  invalidateUser(user.id);
  const u = { ...user, timezone: tz };
  const existing = await db.select({ name: studyAreas.name }).from(studyAreas).where(eq(studyAreas.userId, user.id));
  const taken = new Set(existing.map((e) => e.name.toLowerCase()));
  const fresh = input.areas.filter((a) => {
    const k = a.name.toLowerCase();
    if (taken.has(k)) return false;
    taken.add(k);
    return true;
  });
  if (fresh.length) {
    await db.insert(studyAreas).values(
      fresh.map((a, i) => ({
        userId: user.id,
        name: a.name,
        color: a.color ?? AREA_COLORS[i % AREA_COLORS.length]!,
        icon: a.icon && (AREA_ICONS as readonly string[]).includes(a.icon) ? a.icon : guessIcon(a.name),
      })),
    );
  }
  await setGoal(u, { type: "DAILY", targetMinutes: input.dailyGoalMinutes });
  await setGoal(u, { type: "WEEKLY", targetMinutes: input.weeklyGoalMinutes });
  await db.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, user.id));
  invalidateUser(user.id);
}

export async function updateSettings(user: User, input: z.infer<typeof settingsSchema>) {
  const { dailyGoalMinutes, timezone, avatarUrl, ...rest } = input;
  if (timezone && !isValidTimeZone(timezone)) throw badRequest("Unknown timezone");
  const [row] = await db
    .update(users)
    .set({
      ...rest,
      ...(timezone ? { timezone } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl || null } : {}),
    })
    .where(eq(users.id, user.id))
    .returning();
  invalidateUser(user.id);
  if (dailyGoalMinutes) await setGoal(row!, { type: "DAILY", targetMinutes: dailyGoalMinutes });
  return row!;
}

export async function getSettings(user: User) {
  const [daily] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, user.id), eq(goals.type, "DAILY"), isNull(goals.endDate)));
  return { dailyGoalMinutes: daily?.targetMinutes ?? null };
}

export async function deleteAccount(user: User) {
  // ON DELETE CASCADE removes every row owned by the user.
  invalidateUser(user.id);
  await db.delete(users).where(eq(users.id, user.id));
}

export async function saveReflection(user: User, input: z.infer<typeof reflectionSchema>) {
  const [s] = await db
    .select({ id: dailySessions.id })
    .from(dailySessions)
    .where(and(eq(dailySessions.id, input.dailySessionId), eq(dailySessions.userId, user.id)));
  if (!s) throw notFound("Session");
  const [row] = await db
    .insert(reflections)
    .values({ userId: user.id, dailySessionId: s.id, rating: input.rating, note: input.note ?? null })
    .onConflictDoUpdate({
      target: reflections.dailySessionId,
      set: { rating: input.rating, note: input.note ?? null, updatedAt: new Date() },
    })
    .returning();
  return row!;
}

export async function getDailySession(user: User, id: string) {
  const [s] = await db
    .select()
    .from(dailySessions)
    .where(and(eq(dailySessions.id, id), eq(dailySessions.userId, user.id)));
  if (!s) throw notFound("Session");
  const [r] = await db.select().from(reflections).where(eq(reflections.dailySessionId, id));
  return { session: s, reflection: r ?? null };
}

/* ───────── Export ───────── */

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportActivitiesCsv(user: User) {
  const rows = await db
    .select({
      a: activitySessions,
      area: studyAreas.name,
      task: tasks.name,
      day: dailySessions.label,
    })
    .from(activitySessions)
    .leftJoin(studyAreas, eq(studyAreas.id, activitySessions.studyAreaId))
    .leftJoin(tasks, eq(tasks.id, activitySessions.taskId))
    .leftJoin(dailySessions, eq(dailySessions.id, activitySessions.dailySessionId))
    .where(eq(activitySessions.userId, user.id))
    .orderBy(asc(activitySessions.startedAt));

  const tz = user.timezone;
  const header = ["Date", "Subject", "Task", "Start", "End", "Duration (min)", "Type", "Mode", "End reason", "Source", "Label", "Note"];
  const lines = [header.join(",")];
  for (const { a, area, task } of rows) {
    lines.push(
      [
        localDateKey(a.startedAt, tz),
        area ?? "",
        task ?? "",
        formatTimeInTz(a.startedAt, tz, "yyyy-MM-dd HH:mm:ss"),
        a.endedAt ? formatTimeInTz(a.endedAt, tz, "yyyy-MM-dd HH:mm:ss") : "running",
        a.durationSeconds !== null ? (a.durationSeconds / 60).toFixed(1) : "",
        a.type,
        a.mode ?? "",
        a.endReason ?? "",
        a.source,
        a.label ?? "",
        a.note ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}
