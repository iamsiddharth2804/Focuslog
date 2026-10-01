import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  activitySessions,
  dailySessions,
  pauses,
  studyAreas,
  tasks,
  type ActivitySession,
  type ActivityType,
  type DailySession,
  type Pause,
  type User,
} from "@/db/schema";
import { ApiError, badRequest, conflict, notFound } from "@/lib/api";
import { activeIntervals, localDateKey, sumSeconds } from "@/lib/time";
import { breakKindOf, decodePlan, encodeBreak, nextBreak, type PomodoroPlan } from "@/lib/pomodoro";

/*
 * Tracking model
 * ──────────────
 * DailySession  — the outer container ("I'm at the library"). ACTIVE | PAUSED | ENDED.
 * ActivitySession — one contiguous block of FOCUS / BREAK / PHONE / OTHER.
 *                   Switching state ends the current block and opens a new one.
 * Pause — pause intervals for either of the above.
 *
 * Every mutation runs in a transaction holding a per-user advisory lock, and partial
 * unique indexes guarantee at most one open daily session and one open activity per user.
 * The client never computes durations from a ticking counter — only from these timestamps.
 */

async function lockUser(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
}

/**
 * Run `fn` in a transaction holding the user's advisory lock. The lock query is sent first
 * and `fn`'s first reads are pipelined right behind it on the same connection — Postgres
 * executes them in order, so the lock is held before anything is read, but it costs no
 * extra round trip to the database.
 */
function withLock<T>(userId: string, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    const lock = lockUser(tx, userId);
    try {
      return await fn(tx);
    } finally {
      await lock.catch(() => undefined);
    }
  });
}

/**
 * When did the user actually click? The browser sends its (server-corrected) click time so
 * recorded pauses match what was on screen, even if the request took a while to arrive.
 * It is trusted only within limits: never in the future, at most 30 s in the past, and never
 * before the latest thing already recorded — so it can't rewrite history.
 */
function clickTime(clientAt: string | undefined, now: Date, floors: Array<Date | null | undefined>) {
  let t = now.getTime();
  if (clientAt) {
    const c = Date.parse(clientAt);
    if (Number.isFinite(c)) t = Math.min(t, Math.max(c, t - 30_000));
  }
  for (const f of floors) if (f) t = Math.max(t, f.getTime());
  return new Date(t);
}
const snapFloors = (snap: { act: ActivitySession | null; ps: Pause[]; day: DailySession | null }) => [
  snap.day?.startedAt,
  snap.act?.startedAt,
  ...snap.ps.flatMap((p) => [p.pausedAt, p.resumedAt]),
];

/** The user's default plan, from Settings. */
export function userPlan(user: User): PomodoroPlan {
  return { focus: user.defaultFocusMinutes, short: user.defaultBreakMinutes, long: user.longBreakMinutes, every: user.longBreakEvery };
}

/**
 * Where the open session stands in its pomodoro cycle: focus sessions that ran to zero
 * since the last long break, and the plan of the latest focus block.
 */
async function cycleState(tx: Tx, user: User, dailySessionId: string) {
  const rows = await tx
    .select({ type: activitySessions.type, mode: activitySessions.mode, endReason: activitySessions.endReason })
    .from(activitySessions)
    .where(
      and(
        eq(activitySessions.dailySessionId, dailySessionId),
        or(
          and(eq(activitySessions.type, "FOCUS"), eq(activitySessions.endReason, "COMPLETED")),
          and(eq(activitySessions.type, "BREAK"), sql`${activitySessions.mode} like 'L:%'`, sql`${activitySessions.endedAt} is not null`),
        ),
      ),
    )
    .orderBy(asc(activitySessions.startedAt));
  let completed = 0;
  for (const r of rows) completed = r.type === "BREAK" ? 0 : completed + 1;
  return completed;
}

async function openDay(tx: Tx, userId: string) {
  const [day] = await tx
    .select()
    .from(dailySessions)
    .where(and(eq(dailySessions.userId, userId), ne(dailySessions.status, "ENDED")))
    .limit(1);
  return day ?? null;
}

async function openActivity(tx: Tx, userId: string) {
  const [act] = await tx
    .select()
    .from(activitySessions)
    .where(and(eq(activitySessions.userId, userId), isNull(activitySessions.endedAt)))
    .limit(1);
  return act ?? null;
}

async function pausesFor(tx: Tx, where: { activityId?: string; dailySessionId?: string }) {
  if (where.activityId) return tx.select().from(pauses).where(eq(pauses.activityId, where.activityId)).orderBy(asc(pauses.pausedAt));
  if (where.dailySessionId)
    return tx.select().from(pauses).where(eq(pauses.dailySessionId, where.dailySessionId)).orderBy(asc(pauses.pausedAt));
  return [];
}

const openPause = (ps: Pause[]) => ps.find((p) => !p.resumedAt) ?? null;

/** Close an activity at `at`, closing any open pause first. Duration derives from timestamps. */
async function closeActivity(tx: Tx, act: ActivitySession, at: Date, reason: string, loaded?: Pause[]) {
  const ps = loaded ?? (await pausesFor(tx, { activityId: act.id }));
  const op = openPause(ps);
  const endAt = at < act.startedAt ? act.startedAt : at;
  if (op) {
    await tx.update(pauses).set({ resumedAt: endAt < op.pausedAt ? op.pausedAt : endAt }).where(eq(pauses.id, op.id));
    op.resumedAt = endAt;
  }
  const seconds = sumSeconds(activeIntervals(act.startedAt, endAt, ps, endAt));
  const [row] = await tx
    .update(activitySessions)
    .set({ endedAt: endAt, durationSeconds: seconds, endReason: reason })
    .where(eq(activitySessions.id, act.id))
    .returning();
  return row!;
}

type Snapshot = {
  /** The pomodoro that was auto-completed by this call, if any. */
  completed: ActivitySession | null;
  /** The activity still open after finalizing (null if none). */
  act: ActivitySession | null;
  /** Pauses of `act`, oldest first. */
  ps: Pause[];
  day: DailySession | null;
};

/**
 * Load the open day, open activity and that activity's pauses in ONE pipelined round trip,
 * then — if a planned (pomodoro) block has run past its planned length, e.g. the browser was
 * closed — close it at the exact moment it reached its planned length. Honest and deterministic.
 * Callers reuse the returned snapshot instead of querying the same rows again.
 */
async function finalizeExpired(tx: Tx, user: User, now = new Date()): Promise<Snapshot> {
  const userId = user.id;
  const [act, day, ps] = await Promise.all([
    openActivity(tx, userId),
    openDay(tx, userId),
    tx
      .select()
      .from(pauses)
      .where(
        sql`${pauses.activityId} = (select id from activity_sessions where user_id = ${userId} and ended_at is null limit 1)`,
      )
      .orderBy(asc(pauses.pausedAt)),
  ]);
  if (!act) return { completed: null, act: null, ps: [], day };
  if (act.plannedSeconds) {
    const intervals = activeIntervals(act.startedAt, null, ps, now);
    let remaining = act.plannedSeconds * 1000;
    for (const i of intervals) {
      const len = i.end - i.start;
      if (len >= remaining) {
        const completed = await closeActivity(tx, act, new Date(i.start + remaining), "COMPLETED", ps);
        const next = await autoStartNext(tx, user, completed, now);
        return { completed, act: next, ps: [], day };
      }
      remaining -= len;
    }
  }
  return { completed: null, act, ps, day };
}

/**
 * Auto-start (opt-in in Settings): when a focus block runs to zero, start the next break;
 * when a break runs to zero, start the next focus block. The new block begins at the exact
 * moment the previous one ended, so there is no gap. It only chains when the block finished
 * in the last minute — i.e. someone is actually there — so a closed laptop never keeps
 * "studying" all afternoon.
 */
async function autoStartNext(tx: Tx, user: User, done: ActivitySession, now: Date): Promise<ActivitySession | null> {
  if (!done.endedAt || now.getTime() - done.endedAt.getTime() > 60_000) return null;
  const plan = decodePlan(done.mode, userPlan(user));
  if (done.type === "FOCUS" && user.autoStartBreaks) {
    const nb = nextBreak(await cycleState(tx, user, done.dailySessionId), plan);
    return insertBlock(tx, user, done.dailySessionId, { type: "BREAK", mode: encodeBreak(nb.kind, plan), plannedSeconds: nb.minutes * 60, startedAt: done.endedAt });
  }
  if (done.type === "BREAK" && breakKindOf(done.mode) && user.autoStartFocus) {
    const [lastFocus] = await tx
      .select()
      .from(activitySessions)
      .where(and(eq(activitySessions.dailySessionId, done.dailySessionId), eq(activitySessions.type, "FOCUS")))
      .orderBy(desc(activitySessions.startedAt))
      .limit(1);
    return insertBlock(tx, user, done.dailySessionId, {
      type: "FOCUS",
      studyAreaId: lastFocus?.studyAreaId ?? null,
      taskId: lastFocus?.taskId ?? null,
      mode: lastFocus?.mode ?? null,
      plannedSeconds: (lastFocus ? decodePlan(lastFocus.mode, plan) : plan).focus * 60,
      startedAt: done.endedAt,
    });
  }
  return null;
}

async function insertBlock(
  tx: Tx,
  user: User,
  dailySessionId: string,
  v: { type: ActivityType; studyAreaId?: string | null; taskId?: string | null; mode: string | null; plannedSeconds: number | null; startedAt: Date },
) {
  const [row] = await tx
    .insert(activitySessions)
    .values({
      userId: user.id,
      dailySessionId,
      studyAreaId: v.studyAreaId ?? null,
      taskId: v.taskId ?? null,
      type: v.type,
      mode: v.mode,
      plannedSeconds: v.plannedSeconds,
      startedAt: v.startedAt,
      source: "WEB",
    })
    .returning();
  return row!;
}

async function ensureOwnership(tx: Tx, userId: string, studyAreaId?: string | null, taskId?: string | null) {
  let areaId = studyAreaId ?? null;
  if (taskId) {
    const [t] = await tx
      .select({ id: tasks.id, studyAreaId: tasks.studyAreaId })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    if (!t) throw notFound("Task");
    if (areaId && t.studyAreaId !== areaId) throw badRequest("That task belongs to a different study area");
    areaId = t.studyAreaId;
  }
  if (areaId) {
    const [a] = await tx
      .select({ id: studyAreas.id })
      .from(studyAreas)
      .where(and(eq(studyAreas.id, areaId), eq(studyAreas.userId, userId)));
    if (!a) throw notFound("Study area");
  }
  return areaId;
}

async function createDay(tx: Tx, user: User, now: Date, label?: string | null) {
  const [day] = await tx
    .insert(dailySessions)
    .values({
      userId: user.id,
      date: localDateKey(now, user.timezone),
      label: label || null,
      startedAt: now,
      status: "ACTIVE",
    })
    .returning();
  return day!;
}

async function resumeDayTx(tx: Tx, day: DailySession, now: Date) {
  const ps = await pausesFor(tx, { dailySessionId: day.id });
  const op = openPause(ps);
  if (op) {
    await tx.update(pauses).set({ resumedAt: now }).where(eq(pauses.id, op.id));
    // Resume the activity that was paused *by* the day pause (not one the user paused earlier).
    const act = await openActivity(tx, day.userId);
    if (act) {
      const aps = await pausesFor(tx, { activityId: act.id });
      const aop = openPause(aps);
      if (aop && aop.pausedAt.getTime() >= op.pausedAt.getTime()) {
        await tx.update(pauses).set({ resumedAt: now }).where(eq(pauses.id, aop.id));
      }
    }
  }
  await tx.update(dailySessions).set({ status: "ACTIVE" }).where(eq(dailySessions.id, day.id));
}

/* ───────────────────────── Daily session API ───────────────────────── */

export function startDay(user: User, label?: string | null) {
  return withLock(user.id, async (tx) => {
    const existing = await openDay(tx, user.id);
    if (existing) throw conflict("SESSION_ALREADY_ACTIVE", "You already have a session running.");
    return createDay(tx, user, new Date(), label);
  });
}

export function pauseDay(user: User, clientAt?: string) {
  return withLock(user.id, async (tx) => {
    const snap = await finalizeExpired(tx, user, new Date());
    const { day, act, ps } = snap;
    if (!day) throw conflict("NO_ACTIVE_SESSION", "There's no session to pause.");
    if (day.status === "PAUSED") return day;
    const now = clickTime(clientAt, new Date(), snapFloors(snap));
    await tx.insert(pauses).values({ userId: user.id, dailySessionId: day.id, pausedAt: now });
    if (act && !openPause(ps)) await tx.insert(pauses).values({ userId: user.id, activityId: act.id, pausedAt: now });
    const [row] = await tx.update(dailySessions).set({ status: "PAUSED" }).where(eq(dailySessions.id, day.id)).returning();
    return row!;
  });
}

export function resumeDay(user: User, clientAt?: string) {
  return withLock(user.id, async (tx) => {
    const day = await openDay(tx, user.id);
    if (!day) throw conflict("NO_ACTIVE_SESSION", "There's no session to resume.");
    if (day.status === "ACTIVE") return day;
    const dps = await pausesFor(tx, { dailySessionId: day.id });
    await resumeDayTx(tx, day, clickTime(clientAt, new Date(), [day.startedAt, ...dps.map((p) => p.pausedAt)]));
    return { ...day, status: "ACTIVE" as const };
  });
}

/**
 * End the day. `endAtLastActivity` is for a session left open overnight:
 * it closes the session when the last recorded activity ended rather than "now",
 * so forgotten hours don't inflate the record.
 */
export function endDay(user: User, opts: { endAtLastActivity?: boolean } = {}) {
  return withLock(user.id, async (tx) => {
    const now = new Date();
    const { day, act, ps: aps } = await finalizeExpired(tx, user, now);
    if (!day) throw conflict("SESSION_ALREADY_ENDED", "This session has already ended.");

    let endAt = now;
    if (opts.endAtLastActivity) {
      if (act) {
        // Close a dangling activity at its last un-paused moment.
        const op = openPause(aps);
        endAt = op ? op.pausedAt : now;
      } else {
        const [last] = await tx
          .select({ endedAt: activitySessions.endedAt })
          .from(activitySessions)
          .where(eq(activitySessions.dailySessionId, day.id))
          .orderBy(desc(activitySessions.endedAt))
          .limit(1);
        endAt = last?.endedAt ?? day.startedAt;
      }
    }
    if (act) await closeActivity(tx, act, endAt, "FINISHED", aps);

    const op = openPause(await pausesFor(tx, { dailySessionId: day.id }));
    if (op) await tx.update(pauses).set({ resumedAt: endAt < op.pausedAt ? op.pausedAt : endAt }).where(eq(pauses.id, op.id));

    const [row] = await tx
      .update(dailySessions)
      .set({ status: "ENDED", endedAt: endAt < day.startedAt ? day.startedAt : endAt })
      .where(eq(dailySessions.id, day.id))
      .returning();
    return row!;
  });
}

/* ───────────────────────── Activity API ───────────────────────── */

export type StartActivityInput = {
  type: ActivityType;
  studyAreaId?: string | null;
  taskId?: string | null;
  mode?: string | null;
  plannedMinutes?: number | null;
  label?: string | null;
  expectedCurrentId?: string | null;
  at?: string;
};

export function startActivity(user: User, input: StartActivityInput) {
  return withLock(user.id, async (tx) => {
    const snap = await finalizeExpired(tx, user, new Date());
    // A just-auto-completed block's end is also a floor: the new one can't start before it.
    const now = clickTime(input.at, new Date(), [...snapFloors(snap), snap.completed?.endedAt]);
    const current = snap.act;
    if (input.expectedCurrentId !== undefined && (current?.id ?? null) !== (input.expectedCurrentId ?? null)) {
      throw conflict("STALE_STATE", "Your timer changed in another tab. We've refreshed it — try again.");
    }

    const studyAreaId = input.type === "FOCUS" ? await ensureOwnership(tx, user.id, input.studyAreaId, input.taskId) : null;
    const taskId = input.type === "FOCUS" ? (input.taskId ?? null) : null;

    let day = snap.day;
    if (!day) day = await createDay(tx, user, now);
    else if (day.status === "PAUSED") await resumeDayTx(tx, day, now);

    if (current) await closeActivity(tx, current, now, "SWITCHED", snap.ps);

    if (taskId) {
      await tx
        .update(tasks)
        .set({ status: "IN_PROGRESS" })
        .where(and(eq(tasks.id, taskId), eq(tasks.status, "TODO")));
    }

    // A break with no explicit length gets the next break of the cycle — short, or long when it's earned.
    let mode = input.mode ?? null;
    let plannedSeconds = input.plannedMinutes ? input.plannedMinutes * 60 : null;
    if (input.type === "BREAK" && !plannedSeconds) {
      const [lastFocus] = await tx
        .select({ mode: activitySessions.mode })
        .from(activitySessions)
        .where(and(eq(activitySessions.dailySessionId, day.id), eq(activitySessions.type, "FOCUS")))
        .orderBy(desc(activitySessions.startedAt))
        .limit(1);
      const plan = decodePlan(lastFocus?.mode, userPlan(user));
      const nb = nextBreak(await cycleState(tx, user, day.id), plan);
      mode = encodeBreak(nb.kind, plan);
      plannedSeconds = nb.minutes * 60;
    }

    const [row] = await tx
      .insert(activitySessions)
      .values({
        userId: user.id,
        dailySessionId: day.id,
        studyAreaId,
        taskId,
        type: input.type,
        mode,
        plannedSeconds,
        startedAt: now,
        label: input.label ?? null,
        source: "WEB",
      })
      .returning();
    return row!;
  });
}

function requireCurrent(act: ActivitySession | null, activityId?: string) {
  if (!act) throw conflict("NO_ACTIVE_ACTIVITY", "Nothing is running right now.");
  if (activityId && act.id !== activityId) {
    throw conflict("STALE_STATE", "Your timer changed in another tab. We've refreshed it.");
  }
  return act;
}

export function pauseActivity(user: User, activityId?: string, clientAt?: string) {
  return withLock(user.id, async (tx) => {
    const snap = await finalizeExpired(tx, user, new Date());
    const done = snap.completed;
    if (done && (!activityId || done.id === activityId)) return { completed: done };
    const act = requireCurrent(snap.act, activityId);
    const now = clickTime(clientAt, new Date(), snapFloors(snap));
    if (!openPause(snap.ps)) await tx.insert(pauses).values({ userId: user.id, activityId: act.id, pausedAt: now });
    return { activity: act };
  });
}

export function resumeActivity(user: User, activityId?: string, clientAt?: string) {
  return withLock(user.id, async (tx) => {
    const snap = await finalizeExpired(tx, user, new Date());
    if (snap.completed && (!activityId || snap.completed.id === activityId)) return { completed: snap.completed };
    const act = requireCurrent(snap.act, activityId);
    const now = clickTime(clientAt, new Date(), snapFloors(snap));
    const op = openPause(snap.ps);
    if (op) await tx.update(pauses).set({ resumedAt: now }).where(eq(pauses.id, op.id));
    const day = snap.day;
    if (day?.status === "PAUSED") {
      const dop = openPause(await pausesFor(tx, { dailySessionId: day.id }));
      if (dop) await tx.update(pauses).set({ resumedAt: now }).where(eq(pauses.id, dop.id));
      await tx.update(dailySessions).set({ status: "ACTIVE" }).where(eq(dailySessions.id, day.id));
    }
    return { activity: act };
  });
}

export type EndActivityInput = {
  activityId?: string;
  reason?: "COMPLETED" | "FINISHED";
  resumePrevious?: boolean;
  completeTask?: boolean;
  note?: string;
  at?: string;
};

export function endActivity(user: User, input: EndActivityInput) {
  return withLock(user.id, async (tx) => {
    const snap = await finalizeExpired(tx, user, new Date());
    const now = input.reason === "COMPLETED" ? new Date() : clickTime(input.at, new Date(), snapFloors(snap));
    let ended = snap.completed;
    if (!ended) {
      const act = snap.act;
      if (!act) {
        // Already ended (another tab, or auto-completed). Idempotent: return the latest one.
        if (input.activityId) {
          const [prev] = await tx
            .select()
            .from(activitySessions)
            .where(and(eq(activitySessions.id, input.activityId), eq(activitySessions.userId, user.id)));
          if (prev?.endedAt) return { ended: prev, next: null };
        }
        throw conflict("NO_ACTIVE_ACTIVITY", "Nothing is running right now.");
      }
      if (input.activityId && act.id !== input.activityId) {
        throw conflict("STALE_STATE", "Your timer changed in another tab. We've refreshed it.");
      }
      // "COMPLETED" is only honoured when the timer really is (within a few seconds of) zero —
      // device clocks drift, but a block stopped early is "FINISHED", never a completed pomodoro.
      let reason = input.reason ?? "FINISHED";
      if (reason === "COMPLETED") {
        const left = act.plannedSeconds ? act.plannedSeconds - sumSeconds(activeIntervals(act.startedAt, null, snap.ps, now)) : Infinity;
        if (left > 5) reason = "FINISHED";
      }
      ended = await closeActivity(tx, act, now, reason, snap.ps);
      if (reason === "COMPLETED") {
        const next = await autoStartNext(tx, user, ended, now);
        if (next) return { ended, next };
      }
    } else if (snap.act) {
      // Finalizing already completed it and auto-started the next block.
      return { ended, next: snap.act };
    }
    if (input.note) await tx.update(activitySessions).set({ note: input.note }).where(eq(activitySessions.id, ended.id));

    if (input.completeTask && ended.taskId) {
      await tx
        .update(tasks)
        .set({ status: "DONE", completedAt: now })
        .where(and(eq(tasks.id, ended.taskId), eq(tasks.userId, user.id), ne(tasks.status, "DONE")));
    }

    let next: ActivitySession | null = null;
    if (input.resumePrevious && ended.type !== "FOCUS") {
      const [prevFocus] = await tx
        .select()
        .from(activitySessions)
        .where(and(eq(activitySessions.dailySessionId, ended.dailySessionId), eq(activitySessions.type, "FOCUS")))
        .orderBy(desc(activitySessions.startedAt))
        .limit(1);
      if (prevFocus) {
        const [row] = await tx
          .insert(activitySessions)
          .values({
            userId: user.id,
            dailySessionId: ended.dailySessionId,
            studyAreaId: prevFocus.studyAreaId,
            taskId: prevFocus.taskId,
            type: "FOCUS",
            mode: prevFocus.mode,
            plannedSeconds: prevFocus.plannedSeconds,
            startedAt: now,
            source: "WEB",
          })
          .returning();
        next = row!;
      }
    }
    return { ended, next };
  });
}

/* ───────────────────────── State snapshot ───────────────────────── */

export type TrackerState = Awaited<ReturnType<typeof getTrackerState>>;

/**
 * Current tracker state — the single snapshot every client view renders from.
 * All reads go out in ONE parallel wave (open rows are found by subquery, not in a first
 * pass), so this costs one round trip to the database. The locking finalize transaction
 * only runs when a pomodoro has actually reached zero.
 */
export async function getTrackerState(user: User, opts: { finalize?: boolean } = {}) {
  const first = await readState(user, new Date());
  if (opts.finalize === false || !first.expired) return first.state;
  await withLock(user.id, (tx) => finalizeExpired(tx, user, new Date()));
  return (await readState(user, new Date())).state;
}

async function readState(user: User, now: Date) {
  const openDayId = sql`(select id from daily_sessions where user_id = ${user.id} and status <> 'ENDED' limit 1)`;
  const openActId = sql`(select id from activity_sessions where user_id = ${user.id} and ended_at is null limit 1)`;

  const [[day], [actRow], ps, [last], [lastFocus], cycleRows] = await Promise.all([
    db
      .select()
      .from(dailySessions)
      .where(and(eq(dailySessions.userId, user.id), ne(dailySessions.status, "ENDED")))
      .limit(1),
    db
      .select({
        a: activitySessions,
        area: { id: studyAreas.id, name: studyAreas.name, color: studyAreas.color, icon: studyAreas.icon },
        task: { id: tasks.id, name: tasks.name },
      })
      .from(activitySessions)
      .leftJoin(studyAreas, eq(studyAreas.id, activitySessions.studyAreaId))
      .leftJoin(tasks, eq(tasks.id, activitySessions.taskId))
      .where(and(eq(activitySessions.userId, user.id), isNull(activitySessions.endedAt)))
      .limit(1),
    db
      .select()
      .from(pauses)
      .where(and(eq(pauses.userId, user.id), or(sql`${pauses.dailySessionId} = ${openDayId}`, sql`${pauses.activityId} = ${openActId}`)))
      .orderBy(asc(pauses.pausedAt)),
    // Most recent finished block in the open session — "Back to DSA", completion dialogs.
    db
      .select({
        id: activitySessions.id,
        type: activitySessions.type,
        studyAreaId: activitySessions.studyAreaId,
        taskId: activitySessions.taskId,
        mode: activitySessions.mode,
        plannedSeconds: activitySessions.plannedSeconds,
        endedAt: activitySessions.endedAt,
        endReason: activitySessions.endReason,
        durationSeconds: activitySessions.durationSeconds,
        areaName: studyAreas.name,
        areaColor: studyAreas.color,
        taskName: tasks.name,
      })
      .from(activitySessions)
      .leftJoin(studyAreas, eq(studyAreas.id, activitySessions.studyAreaId))
      .leftJoin(tasks, eq(tasks.id, activitySessions.taskId))
      .where(and(sql`${activitySessions.dailySessionId} = ${openDayId}`, sql`${activitySessions.endedAt} is not null`))
      .orderBy(desc(activitySessions.endedAt))
      .limit(1),
    db
      .select({
        studyAreaId: activitySessions.studyAreaId,
        taskId: activitySessions.taskId,
        mode: activitySessions.mode,
        plannedSeconds: activitySessions.plannedSeconds,
        areaName: studyAreas.name,
        areaColor: studyAreas.color,
        taskName: tasks.name,
      })
      .from(activitySessions)
      .leftJoin(studyAreas, eq(studyAreas.id, activitySessions.studyAreaId))
      .leftJoin(tasks, eq(tasks.id, activitySessions.taskId))
      .where(and(sql`${activitySessions.dailySessionId} = ${openDayId}`, eq(activitySessions.type, "FOCUS")))
      .orderBy(desc(activitySessions.startedAt))
      .limit(1),
    // Pomodoro cycle: completed focus blocks and finished long breaks in the open session
    // (a long break in progress keeps the cycle "full" until it's over).
    db
      .select({ type: activitySessions.type })
      .from(activitySessions)
      .where(
        and(
          sql`${activitySessions.dailySessionId} = ${openDayId}`,
          or(
            and(eq(activitySessions.type, "FOCUS"), eq(activitySessions.endReason, "COMPLETED")),
            and(eq(activitySessions.type, "BREAK"), sql`${activitySessions.mode} like 'L:%'`, sql`${activitySessions.endedAt} is not null`),
          ),
        ),
      )
      .orderBy(asc(activitySessions.startedAt)),
  ]);

  const act = actRow?.a ?? null;
  const dayPauses = day ? ps.filter((p) => p.dailySessionId === day.id) : [];
  const actPauses = act ? ps.filter((p) => p.activityId === act.id) : [];
  const today = localDateKey(now, user.timezone);
  let completedInCycle = 0;
  for (const r of cycleRows) completedInCycle = r.type === "BREAK" ? 0 : completedInCycle + 1;

  const expired = !!act?.plannedSeconds && sumSeconds(activeIntervals(act.startedAt, null, actPauses, now)) >= act.plannedSeconds;
  const iso = (p: Pause) => ({ pausedAt: p.pausedAt.toISOString(), resumedAt: p.resumedAt?.toISOString() ?? null });

  const state = {
    serverNow: now.toISOString(),
    today,
    day: day
      ? {
          id: day.id,
          date: day.date,
          label: day.label,
          status: day.status,
          startedAt: day.startedAt.toISOString(),
          isStale: day.date < today,
          pauses: dayPauses.map(iso),
        }
      : null,
    activity: act
      ? {
          id: act.id,
          type: act.type,
          mode: act.mode,
          plannedSeconds: act.plannedSeconds,
          startedAt: act.startedAt.toISOString(),
          paused: actPauses.some((p) => !p.resumedAt),
          pauses: actPauses.map(iso),
          studyArea: actRow?.area?.id ? actRow.area : null,
          task: actRow?.task?.id ? actRow.task : null,
          label: act.label,
        }
      : null,
    lastEnded: last ? { ...last, endedAt: last.endedAt?.toISOString() ?? null } : null,
    lastFocus: lastFocus ?? null,
    /** Focus sessions that ran to zero since the last long break, in the open session. */
    cycle: { completed: completedInCycle },
  };
  return { state, expired };
}

export { ApiError };
