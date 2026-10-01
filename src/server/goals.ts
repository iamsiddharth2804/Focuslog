import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { goals, studyAreas, type User } from "@/db/schema";
import { notFound } from "@/lib/api";
import { addDaysToKey, localDateKey, weekStartKey } from "@/lib/time";
import { dailyFocusSeries, firstTrackedDate } from "./analytics";

type GoalType = "DAILY" | "WEEKLY" | "SUBJECT_WEEKLY";

const today = (user: User) => localDateKey(new Date(), user.timezone);

const sameScope = (user: User, type: GoalType, studyAreaId?: string | null) =>
  and(
    eq(goals.userId, user.id),
    eq(goals.type, type),
    studyAreaId ? eq(goals.studyAreaId, studyAreaId) : isNull(goals.studyAreaId),
    isNull(goals.endDate),
  );

/**
 * Goals are versioned. Changing a target closes the old row (end_date = yesterday) and
 * opens a new one from today, so past days are judged against the target that applied then.
 */
export async function setGoal(user: User, input: { type: GoalType; studyAreaId?: string | null; targetMinutes: number }) {
  const t = today(user);
  const studyAreaId = input.type === "SUBJECT_WEEKLY" ? (input.studyAreaId ?? null) : null;
  if (input.type === "SUBJECT_WEEKLY") {
    if (!studyAreaId) throw notFound("Study area");
    const [a] = await db.select({ id: studyAreas.id }).from(studyAreas).where(and(eq(studyAreas.id, studyAreaId), eq(studyAreas.userId, user.id)));
    if (!a) throw notFound("Study area");
  }
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(goals).where(sameScope(user, input.type, studyAreaId));
    if (current) {
      if (current.startDate >= t) {
        const [row] = await tx.update(goals).set({ targetMinutes: input.targetMinutes }).where(eq(goals.id, current.id)).returning();
        return row!;
      }
      await tx.update(goals).set({ endDate: addDaysToKey(t, -1) }).where(eq(goals.id, current.id));
    }
    const [row] = await tx
      .insert(goals)
      .values({ userId: user.id, type: input.type, studyAreaId, targetMinutes: input.targetMinutes, startDate: t })
      .returning();
    return row!;
  });
}

export async function clearGoal(user: User, input: { type: GoalType; studyAreaId?: string | null }) {
  const t = today(user);
  const [current] = await db.select().from(goals).where(sameScope(user, input.type, input.studyAreaId));
  if (!current) return;
  if (current.startDate >= t) await db.delete(goals).where(eq(goals.id, current.id));
  else await db.update(goals).set({ endDate: addDaysToKey(t, -1) }).where(eq(goals.id, current.id));
}

export async function deleteGoal(user: User, id: string) {
  const [g] = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, user.id)));
  if (!g) throw notFound("Goal");
  await clearGoal(user, { type: g.type, studyAreaId: g.studyAreaId });
}

export async function getActiveGoals(user: User) {
  return db
    .select({ goal: goals, areaName: studyAreas.name, areaColor: studyAreas.color })
    .from(goals)
    .leftJoin(studyAreas, eq(studyAreas.id, goals.studyAreaId))
    .where(and(eq(goals.userId, user.id), isNull(goals.endDate)))
    .orderBy(asc(goals.createdAt));
}

/** Goals with live progress + streaks. */
export async function goalsOverview(user: User) {
  const t = today(user);
  const weekFrom = weekStartKey(t);
  const [active, firstTracked] = await Promise.all([getActiveGoals(user), firstTrackedDate(user)]);
  const first = firstTracked ?? t;
  // Streak history: from first tracked day (capped at 400 days) to today.
  const from = first < addDaysToKey(t, -400) ? addDaysToKey(t, -400) : first;
  const series = await dailyFocusSeries(user, from < weekFrom ? from : weekFrom, t);
  const byDate = new Map(series.map((d) => [d.date, d]));

  const weekDays = series.filter((d) => d.date >= weekFrom && d.date <= t);
  const weekFocus = weekDays.reduce((a, d) => a + d.focus, 0);
  const todayFocus = byDate.get(t)?.focus ?? 0;
  const weekArea = (areaId: string) => weekDays.reduce((a, d) => a + (d.subjects[areaId] ?? 0), 0);

  const items = active.map(({ goal, areaName, areaColor }) => {
    const progressSec = goal.type === "DAILY" ? todayFocus : goal.type === "WEEKLY" ? weekFocus : weekArea(goal.studyAreaId!);
    const targetSec = goal.targetMinutes * 60;
    return {
      id: goal.id,
      type: goal.type,
      studyAreaId: goal.studyAreaId,
      areaName,
      areaColor,
      targetMinutes: goal.targetMinutes,
      progressSec,
      percent: Math.min(100, Math.round((progressSec / targetSec) * 100)),
      startDate: goal.startDate,
    };
  });

  // Streaks judged against the daily goal that was in effect on each date.
  const dailyGoals = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, user.id), eq(goals.type, "DAILY")))
    .orderBy(asc(goals.startDate));
  const targetOn = (date: string) => {
    const g = dailyGoals.find((g) => g.startDate <= date && (!g.endDate || g.endDate >= date));
    return g ? g.targetMinutes * 60 : null;
  };

  const days = series.filter((d) => d.date >= from);
  const met = (d: { date: string; focus: number }) => {
    const target = targetOn(d.date);
    return target !== null ? d.focus >= target : d.focus > 0;
  };

  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = met(d) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Current: today counts if already met; otherwise the streak is still alive from yesterday.
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]!;
    if (met(d)) current++;
    else if (d.date === t) continue;
    else break;
  }
  const past = days.filter((d) => d.date < t);
  return {
    today: t,
    goals: items,
    streak: {
      current,
      longest,
      todayMet: days.length ? met(days[days.length - 1]!) : false,
      daysStudied: days.filter((d) => d.focus > 0).length,
      daysMissed: past.filter((d) => !met(d)).length,
      trackedSince: from,
    },
    lastDays: days.slice(-28).map((d) => ({ date: d.date, focus: d.focus, met: met(d), target: targetOn(d.date) })),
  };
}
