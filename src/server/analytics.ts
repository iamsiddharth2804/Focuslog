import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, or, sql, gt } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { db } from "@/db";
import { ApiError } from "@/lib/api";
import {
  activitySessions,
  dailySessions,
  pauses,
  reflections,
  studyAreas,
  tasks,
  type ActivityType,
  type Pause,
  type User,
} from "@/db/schema";
import {
  activeIntervals,
  addDaysToKey,
  dayBounds,
  eachDayKey,
  localDateKey,
  localHour,
  sumSeconds,
  weekStartKey,
  type Interval,
} from "@/lib/time";
import { ruleBasedInsights, type Insight } from "./insights";

/*
 * Principle: nothing is pre-aggregated. Every number below is computed from
 * activity start/end timestamps minus pause intervals, clipped to local-day bounds.
 */

type AreaInfo = { id: string; name: string; color: string; icon: string };

export type LoadedActivity = {
  id: string;
  type: ActivityType;
  studyAreaId: string | null;
  taskId: string | null;
  taskName: string | null;
  startedAt: Date;
  endedAt: Date | null;
  endReason: string | null;
  mode: string | null;
  label: string | null;
  dailySessionId: string;
  intervals: Interval[];
  pausedSeconds: number;
};

export type LoadedDay = {
  id: string;
  date: string;
  label: string | null;
  startedAt: Date;
  endedAt: Date | null;
  status: string;
  intervals: Interval[];
  pauses: Pause[];
};

async function loadRange(userId: string, start: Date, end: Date, now = new Date()) {
  // Independent reads go out together (one round trip), then the pauses that depend on them.
  const actRowsP = db
    .select({
      a: activitySessions,
      taskName: tasks.name,
    })
    .from(activitySessions)
    .leftJoin(tasks, eq(tasks.id, activitySessions.taskId))
    .where(
      and(
        eq(activitySessions.userId, userId),
        lt(activitySessions.startedAt, end),
        or(isNull(activitySessions.endedAt), gt(activitySessions.endedAt, start)),
      ),
    )
    .orderBy(asc(activitySessions.startedAt));

  const dayRowsP = db
    .select()
    .from(dailySessions)
    .where(
      and(
        eq(dailySessions.userId, userId),
        lt(dailySessions.startedAt, end),
        or(isNull(dailySessions.endedAt), gt(dailySessions.endedAt, start)),
      ),
    )
    .orderBy(asc(dailySessions.startedAt));

  const completedP = db
    .select({ id: tasks.id, completedAt: tasks.completedAt, studyAreaId: tasks.studyAreaId })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.status, "DONE"), gte(tasks.completedAt, start), lt(tasks.completedAt, end)));
  const areaRowsP = db
    .select({ id: studyAreas.id, name: studyAreas.name, color: studyAreas.color, icon: studyAreas.icon })
    .from(studyAreas)
    .where(eq(studyAreas.userId, userId));
  const [actRows, dayRows, completed, areaRows] = await Promise.all([actRowsP, dayRowsP, completedP, areaRowsP]);

  const actIds = actRows.map((r) => r.a.id);
  const dayIds = dayRows.map((d) => d.id);
  const pauseRows: Pause[] = [];
  const chunk = <T,>(arr: T[], n = 500) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
  const pauseSets = await Promise.all([
    ...chunk(actIds).map((ids) => db.select().from(pauses).where(inArray(pauses.activityId, ids))),
    ...chunk(dayIds).map((ids) => db.select().from(pauses).where(inArray(pauses.dailySessionId, ids))),
  ]);
  for (const set of pauseSets) pauseRows.push(...set);

  const byActivity = new Map<string, Pause[]>();
  const byDay = new Map<string, Pause[]>();
  for (const p of pauseRows) {
    if (p.activityId) byActivity.set(p.activityId, [...(byActivity.get(p.activityId) ?? []), p]);
    if (p.dailySessionId) byDay.set(p.dailySessionId, [...(byDay.get(p.dailySessionId) ?? []), p]);
  }

  const activities: LoadedActivity[] = actRows.map(({ a, taskName }) => {
    const ps = byActivity.get(a.id) ?? [];
    const intervals = activeIntervals(a.startedAt, a.endedAt, ps, now);
    const wall = Math.floor(((a.endedAt ?? now).getTime() - a.startedAt.getTime()) / 1000);
    return {
      id: a.id,
      type: a.type,
      studyAreaId: a.studyAreaId,
      taskId: a.taskId,
      taskName,
      startedAt: a.startedAt,
      endedAt: a.endedAt,
      endReason: a.endReason,
      mode: a.mode,
      label: a.label,
      dailySessionId: a.dailySessionId,
      intervals,
      pausedSeconds: Math.max(0, wall - sumSeconds(intervals)),
    };
  });

  const days: LoadedDay[] = dayRows.map((d) => {
    const ps = byDay.get(d.id) ?? [];
    return {
      id: d.id,
      date: d.date,
      label: d.label,
      startedAt: d.startedAt,
      endedAt: d.endedAt,
      status: d.status,
      pauses: ps,
      intervals: activeIntervals(d.startedAt, d.endedAt, ps, now),
    };
  });

  const areas = new Map<string, AreaInfo>(areaRows.map((a) => [a.id, a]));

  return { activities, days, completed, areas };
}

/** Split an interval at local-midnight boundaries. */
function splitByDay(i: Interval, tz: string): Array<Interval & { key: string }> {
  const out: Array<Interval & { key: string }> = [];
  let s = i.start;
  while (s < i.end) {
    const key = localDateKey(s, tz);
    const { end: dayEnd } = dayBounds(key, tz);
    const e = Math.min(i.end, dayEnd.getTime());
    out.push({ start: s, end: e, key });
    s = e;
  }
  return out;
}

/** Split an interval at local hour boundaries (works for :30 offsets like IST). */
function splitByHour(i: Interval, tz: string): Array<Interval & { hour: number }> {
  const out: Array<Interval & { hour: number }> = [];
  let s = i.start;
  while (s < i.end) {
    const d = new TZDate(s, tz);
    const intoHour = (d.getMinutes() * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();
    const e = Math.min(i.end, s - intoHour + 3_600_000);
    out.push({ start: s, end: e, hour: localHour(s, tz) });
    s = e;
  }
  return out;
}

export type DayStats = {
  date: string;
  sessionSec: number;
  focusSec: number;
  breakSec: number;
  phoneSec: number;
  otherSec: number;
  idleSec: number;
  subjects: Record<string, number>;
  focusSessions: number;
  tasksCompleted: number;
  taskIdsWorked: string[];
};

const emptyDay = (date: string): DayStats => ({
  date,
  sessionSec: 0,
  focusSec: 0,
  breakSec: 0,
  phoneSec: 0,
  otherSec: 0,
  idleSec: 0,
  subjects: {},
  focusSessions: 0,
  tasksCompleted: 0,
  taskIdsWorked: [],
});

const typeKey = { FOCUS: "focusSec", BREAK: "breakSec", PHONE: "phoneSec", OTHER: "otherSec" } as const;

function computeDays(data: Awaited<ReturnType<typeof loadRange>>, keys: string[], tz: string) {
  const map = new Map<string, DayStats>(keys.map((k) => [k, emptyDay(k)]));
  const worked = new Map<string, Set<string>>();

  for (const a of data.activities) {
    for (const i of a.intervals) {
      for (const piece of splitByDay(i, tz)) {
        const d = map.get(piece.key);
        if (!d) continue;
        const sec = (piece.end - piece.start) / 1000;
        d[typeKey[a.type]] += sec;
        if (a.type === "FOCUS") {
          const k = a.studyAreaId ?? "none";
          d.subjects[k] = (d.subjects[k] ?? 0) + sec;
          if (a.taskId) {
            if (!worked.has(piece.key)) worked.set(piece.key, new Set());
            worked.get(piece.key)!.add(a.taskId);
          }
        }
      }
    }
    if (a.type === "FOCUS" && a.intervals.length) {
      const d = map.get(localDateKey(a.startedAt, tz));
      if (d && sumSeconds(a.intervals) >= 60) d.focusSessions += 1;
    }
  }
  for (const s of data.days) {
    for (const i of s.intervals) {
      for (const piece of splitByDay(i, tz)) {
        const d = map.get(piece.key);
        if (d) d.sessionSec += (piece.end - piece.start) / 1000;
      }
    }
  }
  for (const t of data.completed) {
    if (!t.completedAt) continue;
    const d = map.get(localDateKey(t.completedAt, tz));
    if (d) d.tasksCompleted += 1;
  }
  for (const d of map.values()) {
    const tracked = d.focusSec + d.breakSec + d.phoneSec + d.otherSec;
    d.idleSec = Math.max(0, d.sessionSec - tracked);
    d.taskIdsWorked = [...(worked.get(d.date) ?? [])];
    for (const k of ["sessionSec", "focusSec", "breakSec", "phoneSec", "otherSec", "idleSec"] as const) d[k] = Math.round(d[k]);
    for (const k of Object.keys(d.subjects)) d.subjects[k] = Math.round(d.subjects[k]!);
  }
  return map;
}

function subjectList(subjects: Record<string, number>, areas: Map<string, AreaInfo>) {
  return Object.entries(subjects)
    .map(([id, seconds]) => {
      const a = areas.get(id);
      return {
        id,
        name: a?.name ?? (id === "none" ? "Unassigned" : "Deleted area"),
        color: a?.color ?? "#8A9290",
        icon: a?.icon ?? "book-open",
        seconds,
      };
    })
    .filter((s) => s.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
}

function sumStats(days: DayStats[]) {
  const total = emptyDay("total");
  for (const d of days) {
    for (const k of ["sessionSec", "focusSec", "breakSec", "phoneSec", "otherSec", "idleSec", "focusSessions", "tasksCompleted"] as const)
      total[k] += d[k];
    for (const [k, v] of Object.entries(d.subjects)) total.subjects[k] = (total.subjects[k] ?? 0) + v;
  }
  return total;
}

export function productivity(focusSec: number, sessionSec: number) {
  if (sessionSec <= 0) return null;
  return Math.min(100, Math.round((focusSec / sessionSec) * 100));
}

/** Hour-of-day focus distribution across all activities in range. */
function hourly(data: Awaited<ReturnType<typeof loadRange>>, tz: string, start: number, end: number) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, focus: 0, break: 0, phone: 0, other: 0 }));
  const key = { FOCUS: "focus", BREAK: "break", PHONE: "phone", OTHER: "other" } as const;
  for (const a of data.activities) {
    for (const i of a.intervals) {
      const s = Math.max(i.start, start);
      const e = Math.min(i.end, end);
      if (e <= s) continue;
      for (const piece of splitByHour({ start: s, end: e }, tz)) {
        hours[piece.hour]![key[a.type]] += (piece.end - piece.start) / 1000;
      }
    }
  }
  return hours.map((h) => ({ ...h, focus: Math.round(h.focus), break: Math.round(h.break), phone: Math.round(h.phone), other: Math.round(h.other) }));
}

/** Planned = tasks worked on, completed, or due in the period. Completed = tasks finished in it. */
async function taskCompletion(userId: string, workedIds: string[], completedIds: string[], fromKey: string, toKey: string) {
  const due = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), gte(tasks.dueDate, fromKey), sql`${tasks.dueDate} <= ${toKey}`));
  const planned = new Set([...workedIds, ...completedIds, ...due.map((d) => d.id)]);
  const completed = completedIds.length;
  return { completed, planned: planned.size, rate: planned.size ? Math.round((completed / planned.size) * 100) : null };
}

/* ───────────────────────── Public views ───────────────────────── */

export type TimelineEntry =
  | { kind: "session-start" | "session-end"; at: string; label: string | null }
  | { kind: "session-pause"; at: string; end: string | null; seconds: number }
  | { kind: "idle"; at: string; end: string; seconds: number }
  | {
      kind: "activity";
      id: string;
      at: string;
      end: string | null;
      seconds: number;
      pausedSeconds: number;
      type: ActivityType;
      areaName: string | null;
      areaColor: string | null;
      taskName: string | null;
      endReason: string | null;
      label: string | null;
      running: boolean;
    };

/**
 * One local day. With `sessionId`, everything (totals, subjects, timeline, tasks) is scoped
 * to that single daily session — used by the end-of-day summary when a day had several sessions.
 */
export async function dayAnalytics(user: User, dateKey?: string, sessionId?: string) {
  const tz = user.timezone;
  const now = new Date();
  let key = dateKey ?? localDateKey(now, tz);
  if (sessionId) {
    const [own] = await db
      .select({ date: dailySessions.date })
      .from(dailySessions)
      .where(and(eq(dailySessions.id, sessionId), eq(dailySessions.userId, user.id)));
    if (!own) throw new ApiError(404, "NOT_FOUND", "Session not found.");
    key = own.date;
  }
  const { start, end } = dayBounds(key, tz);
  const data = await loadRange(user.id, start, end, now);
  if (sessionId) {
    const s = data.days.find((d) => d.id === sessionId);
    data.days = s ? [s] : [];
    data.activities = data.activities.filter((a) => a.dailySessionId === sessionId);
    const from = s?.startedAt.getTime() ?? 0;
    const to = (s?.endedAt ?? now).getTime();
    data.completed = data.completed.filter((c) => c.completedAt && c.completedAt.getTime() >= from && c.completedAt.getTime() <= to);
  }
  const stats = computeDays(data, [key], tz).get(key)!;

  // Timeline: sessions that started on this date (their whole span) + activities inside them.
  const sessions = data.days.filter((d) => d.date === key);
  const timeline: TimelineEntry[] = [];
  for (const s of sessions) {
    timeline.push({ kind: "session-start", at: s.startedAt.toISOString(), label: s.label });
    const acts = data.activities.filter((a) => a.dailySessionId === s.id);
    let cursor = s.startedAt.getTime();
    const events: TimelineEntry[] = [];
    for (const a of acts) {
      const gap = a.startedAt.getTime() - cursor;
      if (gap >= 60_000) {
        // Was the gap a session pause or genuine idle time?
        const pausedInGap = s.pauses.some((p) => p.pausedAt.getTime() < a.startedAt.getTime() && (p.resumedAt?.getTime() ?? Infinity) > cursor);
        if (!pausedInGap) events.push({ kind: "idle", at: new Date(cursor).toISOString(), end: a.startedAt.toISOString(), seconds: Math.round(gap / 1000) });
      }
      const area = a.studyAreaId ? data.areas.get(a.studyAreaId) : null;
      events.push({
        kind: "activity",
        id: a.id,
        at: a.startedAt.toISOString(),
        end: a.endedAt?.toISOString() ?? null,
        seconds: sumSeconds(a.intervals),
        pausedSeconds: a.pausedSeconds,
        type: a.type,
        areaName: area?.name ?? (a.type === "FOCUS" ? "Unassigned" : null),
        areaColor: area?.color ?? null,
        taskName: a.taskName,
        endReason: a.endReason,
        label: a.label,
        running: !a.endedAt,
      });
      cursor = Math.max(cursor, (a.endedAt ?? now).getTime());
    }
    for (const p of s.pauses) {
      const secs = Math.round(((p.resumedAt ?? s.endedAt ?? now).getTime() - p.pausedAt.getTime()) / 1000);
      if (secs < 60 && p.resumedAt) continue;
      events.push({ kind: "session-pause", at: p.pausedAt.toISOString(), end: p.resumedAt?.toISOString() ?? null, seconds: secs });
    }
    events.sort((a, b) => a.at.localeCompare(b.at));
    timeline.push(...events);
    if (s.endedAt) timeline.push({ kind: "session-end", at: s.endedAt.toISOString(), label: s.label });
  }

  const completedIds = data.completed.map((c) => c.id);
  const [taskStats, reflectionRows] = await Promise.all([
    taskCompletion(user.id, stats.taskIdsWorked, completedIds, key, key),
    sessions.length
      ? db
          .select()
          .from(reflections)
          .where(and(eq(reflections.userId, user.id), inArray(reflections.dailySessionId, sessions.map((s) => s.id))))
      : Promise.resolve([] as (typeof reflections.$inferSelect)[]),
  ]);

  return {
    date: key,
    generatedAt: now.toISOString(),
    totals: {
      session: stats.sessionSec,
      focus: stats.focusSec,
      break: stats.breakSec,
      phone: stats.phoneSec,
      other: stats.otherSec,
      idle: stats.idleSec,
    },
    productivity: productivity(stats.focusSec, stats.sessionSec),
    subjects: subjectList(stats.subjects, data.areas),
    hourly: hourly(data, tz, start.getTime(), end.getTime()),
    focusSessions: stats.focusSessions,
    tasks: taskStats,
    timeline,
    sessions: sessions.map((s) => ({
      id: s.id,
      label: s.label,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      status: s.status,
    })),
    reflections: reflectionRows.map((r) => ({ dailySessionId: r.dailySessionId, rating: r.rating, note: r.note })),
  };
}

async function periodAnalytics(user: User, fromKey: string, toKey: string, prevFromKey: string, prevToKey: string, period: "week" | "month" | "year") {
  const tz = user.timezone;
  const now = new Date();
  const todayKey = localDateKey(now, tz);
  const start = dayBounds(fromKey, tz).start;
  const end = dayBounds(toKey, tz).end;
  const prevStart = dayBounds(prevFromKey, tz).start;

  // Load previous + current in one pass for comparisons.
  const data = await loadRange(user.id, prevStart, end, now);
  const keys = eachDayKey(fromKey, toKey);
  const prevKeys = eachDayKey(prevFromKey, prevToKey);
  const dayMap = computeDays(data, [...prevKeys, ...keys], tz);
  const days = keys.map((k) => dayMap.get(k)!);
  const prevDays = prevKeys.map((k) => dayMap.get(k)!);
  const total = sumStats(days);
  const prevTotal = sumStats(prevDays);

  const elapsedDays = keys.filter((k) => k <= todayKey).length || 1;
  const longest = days.reduce((best, d) => (d.focusSec > best.focusSec ? d : best), days[0]!);
  const studiedDays = days.filter((d) => d.focusSec > 0).length;

  const workedIds = [...new Set(days.flatMap((d) => d.taskIdsWorked))];
  const completedIds = data.completed.filter((c) => c.completedAt && c.completedAt >= start).map((c) => c.id);
  const taskStats = await taskCompletion(user.id, workedIds, completedIds, fromKey, toKey);

  const hours = hourly(data, tz, start.getTime(), end.getTime());
  const subjects = subjectList(total.subjects, data.areas);

  const insights: Insight[] = ruleBasedInsights({
    period,
    focusSec: total.focusSec,
    prevFocusSec: prevTotal.focusSec,
    phoneSec: total.phoneSec,
    breakSec: total.breakSec,
    sessionSec: total.sessionSec,
    subjects,
    hourly: hours,
    taskRate: taskStats.rate,
    tasksCompleted: taskStats.completed,
    studiedDays,
    elapsedDays,
  });

  return {
    from: fromKey,
    to: toKey,
    totals: {
      session: total.sessionSec,
      focus: total.focusSec,
      break: total.breakSec,
      phone: total.phoneSec,
      other: total.otherSec,
      idle: total.idleSec,
    },
    previous: { focus: prevTotal.focusSec, session: prevTotal.sessionSec },
    productivity: productivity(total.focusSec, total.sessionSec),
    averagePerDay: Math.round(total.focusSec / elapsedDays),
    elapsedDays,
    studiedDays,
    longestDay: longest && longest.focusSec > 0 ? { date: longest.date, seconds: longest.focusSec } : null,
    focusSessions: total.focusSessions,
    tasks: taskStats,
    subjects,
    hourly: hours,
    days: days.map((d) => ({
      date: d.date,
      focus: d.focusSec,
      break: d.breakSec,
      phone: d.phoneSec,
      session: d.sessionSec,
      focusSessions: d.focusSessions,
      tasksCompleted: d.tasksCompleted,
      subjects: subjectList(d.subjects, data.areas).slice(0, 6),
    })),
    insights,
  };
}

export function weekAnalytics(user: User, dateKey?: string) {
  const key = dateKey ?? localDateKey(new Date(), user.timezone);
  const from = weekStartKey(key);
  const to = addDaysToKey(from, 6);
  return periodAnalytics(user, from, to, addDaysToKey(from, -7), addDaysToKey(from, -1), "week");
}

export function monthAnalytics(user: User, month?: string) {
  const m = month ?? localDateKey(new Date(), user.timezone).slice(0, 7);
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const from = `${m}-01`;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const to = `${m}-${String(last).padStart(2, "0")}`;
  const prev = new Date(Date.UTC(y, mo - 2, 1));
  const prevM = prev.toISOString().slice(0, 7);
  const prevLast = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 0)).getUTCDate();
  return periodAnalytics(user, from, to, `${prevM}-01`, `${prevM}-${String(prevLast).padStart(2, "0")}`, "month");
}

export async function yearAnalytics(user: User, year?: number) {
  const y = year ?? Number(localDateKey(new Date(), user.timezone).slice(0, 4));
  const base = await periodAnalytics(user, `${y}-01-01`, `${y}-12-31`, `${y - 1}-01-01`, `${y - 1}-12-31`, "year");
  const months = Array.from({ length: 12 }, (_, i) => {
    const prefix = `${y}-${String(i + 1).padStart(2, "0")}`;
    const ds = base.days.filter((d) => d.date.startsWith(prefix));
    return {
      month: prefix,
      focus: ds.reduce((a, d) => a + d.focus, 0),
      studiedDays: ds.filter((d) => d.focus > 0).length,
    };
  });
  return { ...base, months };
}

/** Per-day focus totals for streaks and heatmaps (lightweight). */
export async function dailyFocusSeries(user: User, fromKey: string, toKey: string) {
  const tz = user.timezone;
  const data = await loadRange(user.id, dayBounds(fromKey, tz).start, dayBounds(toKey, tz).end);
  const map = computeDays(data, eachDayKey(fromKey, toKey), tz);
  return [...map.values()].map((d) => ({
    date: d.date,
    focus: d.focusSec,
    focusSessions: d.focusSessions,
    tasksCompleted: d.tasksCompleted,
    subjects: d.subjects,
  }));
}

export async function firstTrackedDate(user: User) {
  const [row] = await db
    .select({ date: sql<string | null>`min(${dailySessions.date})` })
    .from(dailySessions)
    .where(eq(dailySessions.userId, user.id));
  return row?.date ?? null;
}
