"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import type { TrackerState } from "@/server/tracking";
import { api, ApiClientError } from "@/lib/fetcher";
import { activeIntervals, formatClock, sumSeconds } from "@/lib/time";
import { ACTIVITY_LABEL } from "@/lib/constants";
import { breakKindOf, decodePlan, encodeBreak, nextBreak, type BreakKind, type PomodoroPlan } from "@/lib/pomodoro";
import { useNow } from "@/hooks/use-now";
import { useShellUser, type ShellUser } from "@/components/shell/app-shell";
import {
  DEFAULT_ALARM,
  getAlarmPrefs,
  notify,
  onAlarmPrefsChange,
  playAlarmNow,
  scheduleAlarm,
  stopRinging,
  unlockAudio,
  vibrate,
  type AlarmPrefs,
} from "@/lib/alarm";
import type { StudyAreaListItem, TaskItem } from "@/lib/types";

type StartInput = {
  type: "FOCUS" | "BREAK" | "PHONE" | "OTHER";
  studyAreaId?: string | null;
  taskId?: string | null;
  mode?: string | null;
  plannedMinutes?: number | null;
  label?: string | null;
};
type EndOpts = { resumePrevious?: boolean; completeTask?: boolean; reason?: "COMPLETED" | "FINISHED" };

type Ctx = {
  state: TrackerState | undefined;
  isLoading: boolean;
  error: unknown;
  /** True only while a session is being started or ended (those navigate). Timer buttons never wait. */
  busy: boolean;
  /** server-corrected "now" in ms */
  now: number;
  daySeconds: number;
  activitySeconds: number;
  remainingSeconds: number | null;
  /** The pomodoro plan in use (the running block's, else the session's last focus, else Settings). */
  plan: PomodoroPlan;
  /** Focus sessions completed since the last long break. */
  cycleCompleted: number;
  nextBreak: { kind: BreakKind; minutes: number };
  startDay: (label?: string) => Promise<void>;
  pauseDay: () => Promise<void>;
  resumeDay: () => Promise<void>;
  endDay: (opts?: { endAtLastActivity?: boolean }) => Promise<{ dailySessionId: string } | null>;
  startActivity: (input: StartInput) => Promise<boolean>;
  pauseActivity: () => Promise<void>;
  resumeActivity: () => Promise<void>;
  endActivity: (opts?: EndOpts) => Promise<void>;
  refresh: () => void;
};

const TrackerContext = createContext<Ctx | null>(null);
const CHANNEL = "focuslog-tracker";

export const planOf = (u: Pick<ShellUser, "defaultFocusMinutes" | "defaultBreakMinutes" | "longBreakMinutes" | "longBreakEvery">): PomodoroPlan => ({
  focus: u.defaultFocusMinutes,
  short: u.defaultBreakMinutes,
  long: u.longBreakMinutes,
  every: u.longBreakEvery,
});

export function TrackerProvider({ children }: { children: React.ReactNode }) {
  const user = useShellUser();
  const { mutate: globalMutate, cache } = useSWRConfig();
  const pendingRef = useRef(0);
  const { data, error, isLoading, mutate } = useSWR<TrackerState>("/api/state", {
    refreshInterval: 30_000,
    // Don't let a background poll overwrite a click that's still on its way to the server.
    isPaused: () => pendingRef.current > 0,
  });
  const [busy, setBusy] = useState(false);
  const offsetRef = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const completingRef = useRef<string | null>(null);

  /*
   * Two views of the state:
   *  - `data` (SWR) is what the screen shows — it gets the predicted next state the instant you click.
   *  - `confirmedRef` is the last state the SERVER returned. Requests are built from it, at send time.
   * Requests run one after another through `queueRef`, so rapid clicks (pause → resume → pause)
   * are applied in order and never race each other.
   */
  const confirmedRef = useRef<TrackerState | undefined>(undefined);
  const shownRef = useRef<TrackerState | undefined>(undefined);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  shownRef.current = data;
  useEffect(() => {
    if (data && pendingRef.current === 0) confirmedRef.current = data;
  }, [data]);

  // Clock skew correction: trust the server's clock, not the device's.
  useEffect(() => {
    if (data?.serverNow) offsetRef.current = new Date(data.serverNow).getTime() - Date.now();
  }, [data?.serverNow]);

  // Multi-tab sync: any tab that mutates tells the others to refetch from the database.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = () => {
      void mutate();
      void globalMutate((k) => typeof k === "string" && (k.startsWith("/api/analytics") || k.startsWith("/api/goals")));
    };
    channelRef.current = ch;
    return () => ch.close();
  }, [mutate, globalMutate]);

  const running = !!data?.activity && !data.activity.paused;
  const ticking = !!data?.day && (data.day.status === "ACTIVE" || running);
  const deviceNow = useNow(1000, ticking);
  // `firedAt` lets the alarm wake the UI at the exact second, even if the 1 s tick is throttled.
  const [firedAt, setFiredAt] = useState(0);
  const now = Math.max(deviceNow, firedAt) + offsetRef.current;
  const serverNowIso = () => new Date(Date.now() + offsetRef.current).toISOString();

  const daySeconds = data?.day ? sumSeconds(activeIntervals(data.day.startedAt, null, data.day.pauses, now)) : 0;
  const activitySeconds = data?.activity ? sumSeconds(activeIntervals(data.activity.startedAt, null, data.activity.pauses, now)) : 0;
  const remainingSeconds = data?.activity?.plannedSeconds ? Math.max(0, data.activity.plannedSeconds - activitySeconds) : null;

  // Pomodoro position.
  const defaults = planOf(user);
  const a = data?.activity;
  const plan = decodePlan(a && (a.type === "FOCUS" || breakKindOf(a.mode)) ? a.mode : data?.lastFocus?.mode, defaults);
  const cycleCompleted = data?.cycle?.completed ?? 0;
  const nb = nextBreak(cycleCompleted, plan);

  const invalidateViews = useCallback(() => {
    channelRef.current?.postMessage("changed");
    void globalMutate((k) => typeof k === "string" && (k.startsWith("/api/analytics") || k.startsWith("/api/goals") || k.startsWith("/api/study-areas") || k.startsWith("/api/tasks")));
  }, [globalMutate]);

  /**
   * Show `predict(shown)` immediately, then send the request (built from confirmed server
   * state) through the queue. The server's reply becomes the truth; on failure we resync.
   */
  const act = useCallback(
    (predict: ((s: TrackerState, nowIso: string) => TrackerState) | null, request: (confirmed: TrackerState | undefined) => { url: string; body: unknown } | null) => {
      const shown = shownRef.current;
      // One timestamp for both the prediction and the request, so screen and database agree.
      const clickAt = serverNowIso();
      if (predict && shown) {
        const next = predict(shown, clickAt);
        shownRef.current = next;
        void mutate(next, { revalidate: false });
      }
      pendingRef.current++;
      const job = queueRef.current.then(async () => {
        const req = request(confirmedRef.current);
        if (!req) {
          // Nothing to send (e.g. it already ended in another tab) — drop the guess, show the truth.
          if (pendingRef.current === 1) confirmedRef.current = await mutate();
          return true;
        }
        try {
          const s = await api<TrackerState>(req.url, { body: { ...(req.body as object), at: clickAt } });
          confirmedRef.current = s;
          if (pendingRef.current === 1) void mutate(s, { revalidate: false }); // only paint server truth once the queue is drained
          invalidateViews();
          return true;
        } catch (e) {
          if (e instanceof ApiClientError) toast.error(e.message);
          else toast.error("Couldn't reach the server. Your data is safe — try again.");
          const fresh = await mutate(); // resync from the database
          confirmedRef.current = fresh;
          return false;
        } finally {
          pendingRef.current--;
        }
      });
      queueRef.current = job.catch(() => undefined);
      return job;
    },
    [mutate, invalidateViews],
  );

  /** Fill in display details (area, task) for a block that hasn't reached the server yet. */
  const lookup = useCallback(
    (input: StartInput) => {
      const areas = (cache.get("/api/study-areas")?.data as StudyAreaListItem[] | undefined) ?? [];
      const tasks = (cache.get("/api/tasks?status=open")?.data as TaskItem[] | undefined) ?? [];
      const area = areas.find((x) => x.id === input.studyAreaId);
      const task = tasks.find((x) => x.id === input.taskId);
      return {
        studyArea: area ? { id: area.id, name: area.name, color: area.color, icon: area.icon } : null,
        task: task ? { id: task.id, name: task.name } : null,
      };
    },
    [cache],
  );

  const lastStartRef = useRef<{ key: string; at: number } | null>(null);

  const startActivity = useCallback<Ctx["startActivity"]>(
    async (input) => {
      // Swallow accidental double-taps of the same button.
      const key = JSON.stringify(input);
      if (lastStartRef.current && lastStartRef.current.key === key && Date.now() - lastStartRef.current.at < 1200) return true;
      lastStartRef.current = { key, at: Date.now() };

      // Breaks follow the cycle unless a length is given.
      let { mode, plannedMinutes } = input;
      if (input.type === "BREAK" && !plannedMinutes) {
        mode = encodeBreak(nb.kind, plan);
        plannedMinutes = nb.minutes;
      }
      const full: StartInput = { ...input, mode: mode ?? null, plannedMinutes: plannedMinutes ?? null };
      const info = input.type === "FOCUS" ? lookup(full) : { studyArea: null, task: null };

      return act(
        (s, at) => predictStart(s, at, full, info),
        (confirmed) => ({ url: "/api/activity/start", body: { ...full, expectedCurrentId: confirmed?.activity?.id ?? null } }),
      );
    },
    [act, lookup, nb.kind, nb.minutes, plan],
  );

  const endActivity = useCallback<Ctx["endActivity"]>(
    async (opts = {}) => {
      const shown = shownRef.current;
      await act(
        (s, at) => {
          if (opts.resumePrevious && s.activity?.type !== "FOCUS" && s.lastFocus) {
            const lf = s.lastFocus;
            return predictStart({ ...s, activity: null }, at, { type: "FOCUS", studyAreaId: lf.studyAreaId, taskId: lf.taskId, mode: lf.mode, plannedMinutes: lf.plannedSeconds ? lf.plannedSeconds / 60 : null }, {
              studyArea: lf.studyAreaId && lf.areaName ? { id: lf.studyAreaId, name: lf.areaName, color: lf.areaColor ?? "#596273", icon: shown?.activity?.studyArea?.icon ?? "book-open" } : null,
              task: lf.taskId && lf.taskName ? { id: lf.taskId, name: lf.taskName } : null,
            });
          }
          return { ...s, activity: null };
        },
        (confirmed) => (confirmed?.activity ? { url: "/api/activity/end", body: { activityId: confirmed.activity.id, ...opts } } : null),
      );
    },
    [act],
  );

  /* ───────── Alarm: sound, notification, vibration ───────── */

  const [alarm, setAlarm] = useState<AlarmPrefs>(DEFAULT_ALARM);
  const [audioOn, setAudioOn] = useState(false);
  useEffect(() => {
    setAlarm(getAlarmPrefs());
    return onAlarmPrefsChange(() => setAlarm(getAlarmPrefs()));
  }, []);
  // Browsers unlock audio on the first interaction; any click also silences a ringing alarm.
  useEffect(() => {
    const onGesture = () => {
      stopRinging();
      void unlockAudio().then((ok) => ok && setAudioOn(true));
    };
    window.addEventListener("pointerdown", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
    return () => {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
    };
  }, []);

  // Latest values for callbacks that fire later (alarm, background tab).
  const latest = useRef({ alarm, user, plan, cycleCompleted });
  latest.current = { alarm, user, plan, cycleCompleted };
  const announcedRef = useRef<string | null>(null);
  const ringingForRef = useRef<string | null>(null);

  /** Sound + vibration + notification for a block that just hit zero — exactly once per block. */
  const announce = useCallback((cur: NonNullable<TrackerState["activity"]>) => {
    const key = cur.id.startsWith("pending") ? `p:${cur.startedAt}` : cur.id;
    if (announcedRef.current === key) return;
    announcedRef.current = key;
    const { alarm: a, user: u, plan: p, cycleCompleted: done } = latest.current;
    if (ringingForRef.current !== key) playAlarmNow(a); // not pre-scheduled (audio was locked) — ring now
    if (a.vibrate) vibrate();
    if (a.notify && document.visibilityState !== "visible") {
      if (cur.type === "FOCUS") {
        const nbk = nextBreak(done + 1, p);
        const len = `${nbk.minutes} min ${nbk.kind === "long" ? "long break" : "break"}`;
        void notify("Focus complete 🎉", u.autoStartBreaks ? `Your ${len} has started.` : `Time for a ${len}.`);
      } else {
        const back = shownRef.current?.lastFocus?.areaName;
        void notify(breakKindOf(cur.mode) === "long" ? "Long break's over" : "Break's over", `${u.autoStartFocus ? "Next" : "Ready for"} ${p.focus} min focus${back ? ` · ${back}` : ""}.`);
      }
    }
  }, []);

  // Pre-schedule the running block's alarm on the audio clock; reschedule on pause/resume/switch.
  const cur = data?.activity;
  const pauseKey = cur ? cur.pauses.map((x) => `${x.pausedAt}-${x.resumedAt}`).join("|") : "";
  useEffect(() => {
    if (!cur?.plannedSeconds || cur.paused) return;
    const nowMs = Date.now() + offsetRef.current;
    const usedMs = activeIntervals(cur.startedAt, null, cur.pauses, nowMs).reduce((t, i) => t + (i.end - i.start), 0);
    const leftSec = (cur.plannedSeconds * 1000 - usedMs) / 1000;
    if (leftSec <= 0) return;
    const key = cur.id.startsWith("pending") ? `p:${cur.startedAt}` : cur.id;
    const snapshot = cur;
    const cancel = scheduleAlarm(leftSec, alarm, () => {
      ringingForRef.current = key;
      setFiredAt(Date.now());
      announce(snapshot);
    });
    return () => cancel?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id, cur?.paused, cur?.plannedSeconds, cur?.startedAt, pauseKey, alarm, audioOn, announce]);

  // Pomodoro reached zero in this tab: chime, close it at the server, and (if enabled in
  // Settings) roll straight into the next break / focus. The server also finalizes on its
  // own on the next read, so a closed tab never loses a session.
  const actId = data?.activity?.id;
  useEffect(() => {
    if (!actId || actId.startsWith("pending") || remainingSeconds === null || remainingSeconds > 0) return;
    if (completingRef.current === actId) return;
    completingRef.current = actId;
    const done = shownRef.current?.activity;
    if (!done) return;
    announce(done);
    const isFocus = done.type === "FOCUS";
    const willChain = isFocus ? user.autoStartBreaks : !!breakKindOf(done.mode) && user.autoStartFocus;
    void act(
      (s, at) => {
        if (!willChain) return { ...s, activity: null };
        if (isFocus) {
          const after = nextBreak(cycleCompleted + 1, plan);
          return predictStart({ ...s, activity: null }, at, { type: "BREAK", mode: encodeBreak(after.kind, plan), plannedMinutes: after.minutes }, { studyArea: null, task: null });
        }
        const lf = s.lastFocus;
        return predictStart({ ...s, activity: null }, at, { type: "FOCUS", studyAreaId: lf?.studyAreaId, taskId: lf?.taskId, mode: lf?.mode ?? null, plannedMinutes: plan.focus }, {
          studyArea: lf?.studyAreaId && lf.areaName ? { id: lf.studyAreaId, name: lf.areaName, color: lf.areaColor ?? "#596273", icon: "book-open" } : null,
          task: lf?.taskId && lf.taskName ? { id: lf.taskId, name: lf.taskName } : null,
        });
      },
      () => ({ url: "/api/activity/end", body: { activityId: actId, reason: "COMPLETED" } }),
    ).then((ok) => {
      if (!ok || !willChain) return;
      if (isFocus) {
        const after = nextBreak(cycleCompleted + 1, plan);
        toast.success(`Focus complete 🎉 ${after.minutes} min ${after.kind === "long" ? "long " : ""}break started.`);
      } else toast.success(`Break's over — next ${plan.focus} min focus started.`);
    });
  }, [actId, remainingSeconds, act, user.autoStartBreaks, user.autoStartFocus, cycleCompleted, plan, announce]);

  // Live tab title.
  useEffect(() => {
    const cur = data?.activity;
    if (cur) {
      const t = remainingSeconds !== null ? formatClock(remainingSeconds, true) : formatClock(activitySeconds, true);
      const kind = breakKindOf(cur.mode);
      const what = cur.type === "FOCUS" ? (cur.studyArea?.name ?? "Study") : kind === "long" ? "Long break" : ACTIVITY_LABEL[cur.type];
      document.title = `${cur.paused ? "⏸ " : ""}${t} · ${what}`;
    } else document.title = "FocusLog";
  }, [data?.activity, activitySeconds, remainingSeconds]);

  // Session start/end navigate to new screens, so these wait for the server.
  const startDay = useCallback(
    async (label?: string) => {
      setBusy(true);
      await act(null, () => ({ url: "/api/daily-sessions/start", body: { label } }));
      setBusy(false);
    },
    [act],
  );
  const endDay = useCallback<Ctx["endDay"]>(
    async (opts) => {
      setBusy(true);
      try {
        await queueRef.current; // let pending clicks land first
        if (shownRef.current) void mutate({ ...shownRef.current, day: null, activity: null }, { revalidate: false });
        const r = await api<{ dailySessionId: string }>("/api/daily-sessions/end", { body: opts ?? {} });
        confirmedRef.current = await mutate();
        invalidateViews();
        return r;
      } catch (e) {
        toast.error(e instanceof ApiClientError ? e.message : "Couldn't reach the server. Your session is still running.");
        confirmedRef.current = await mutate();
        return null;
      } finally {
        setBusy(false);
      }
    },
    [mutate, invalidateViews],
  );

  const value = useMemo<Ctx>(
    () => ({
      state: data,
      isLoading,
      error,
      busy,
      now,
      daySeconds,
      activitySeconds,
      remainingSeconds,
      plan,
      cycleCompleted,
      nextBreak: nb,
      startDay,
      pauseDay: async () =>
        void (await act(predictPauseDay, (c) => (c?.day ? { url: "/api/daily-sessions/pause", body: {} } : null))),
      resumeDay: async () =>
        void (await act(predictResumeDay, (c) => (c?.day ? { url: "/api/daily-sessions/resume", body: {} } : null))),
      endDay,
      startActivity,
      pauseActivity: async () =>
        void (await act(predictPauseActivity, (c) => (c?.activity ? { url: "/api/activity/pause", body: { activityId: c.activity.id } } : null))),
      resumeActivity: async () =>
        void (await act(predictResumeActivity, (c) => (c?.activity ? { url: "/api/activity/resume", body: { activityId: c.activity.id } } : null))),
      endActivity,
      refresh: () => void mutate(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, isLoading, error, busy, now, daySeconds, activitySeconds, remainingSeconds, plan.focus, plan.short, plan.long, plan.every, cycleCompleted, nb.kind, nb.minutes, startDay, endDay, startActivity, endActivity, act, mutate],
  );

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker() {
  const ctx = useContext(TrackerContext);
  if (!ctx) throw new Error("useTracker must be used inside TrackerProvider");
  return ctx;
}

/* ───────── Predicted next states (mirror the server's rules) ───────── */

type Pause = { pausedAt: string; resumedAt: string | null };
const openPause = (at: string): Pause => ({ pausedAt: at, resumedAt: null });
const closePauses = (ps: Pause[], at: string) => ps.map((p) => (p.resumedAt ? p : { ...p, resumedAt: at }));

function predictPauseActivity(s: TrackerState, at: string): TrackerState {
  if (!s.activity || s.activity.paused) return s;
  return { ...s, activity: { ...s.activity, paused: true, pauses: [...s.activity.pauses, openPause(at)] } };
}
function predictResumeActivity(s: TrackerState, at: string): TrackerState {
  if (!s.activity?.paused) return s;
  const day = s.day && s.day.status === "PAUSED" ? { ...s.day, status: "ACTIVE" as const, pauses: closePauses(s.day.pauses, at) } : s.day;
  return { ...s, day, activity: { ...s.activity, paused: false, pauses: closePauses(s.activity.pauses, at) } };
}
/** Pausing the day also pauses whatever is running. */
function predictPauseDay(s: TrackerState, at: string): TrackerState {
  if (!s.day || s.day.status !== "ACTIVE") return s;
  return { ...predictPauseActivity(s, at), day: { ...s.day, status: "PAUSED", pauses: [...s.day.pauses, openPause(at)] } };
}
/** Resuming the day resumes the activity it paused. */
function predictResumeDay(s: TrackerState, at: string): TrackerState {
  if (!s.day || s.day.status !== "PAUSED") return s;
  return { ...predictResumeActivity(s, at), day: { ...s.day, status: "ACTIVE", pauses: closePauses(s.day.pauses, at) } };
}
/** Starting a block: opens the day if needed, switches away from the current block. */
function predictStart(
  s: TrackerState,
  at: string,
  input: StartInput,
  info: { studyArea: NonNullable<TrackerState["activity"]>["studyArea"]; task: NonNullable<TrackerState["activity"]>["task"] },
): TrackerState {
  const day = s.day
    ? s.day.status === "PAUSED"
      ? { ...s.day, status: "ACTIVE" as const, pauses: closePauses(s.day.pauses, at) }
      : s.day
    : { id: "pending-day", date: s.today, label: null, status: "ACTIVE" as const, startedAt: at, isStale: false, pauses: [] };
  return {
    ...s,
    day,
    activity: {
      id: `pending-${at}`,
      type: input.type,
      mode: input.mode ?? null,
      plannedSeconds: input.plannedMinutes ? Math.round(input.plannedMinutes * 60) : null,
      startedAt: at,
      paused: false,
      pauses: [],
      studyArea: info.studyArea,
      task: info.task,
      label: input.label ?? null,
    },
  };
}
