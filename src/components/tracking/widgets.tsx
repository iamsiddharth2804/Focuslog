"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Coffee, Pause, Play, Plus, Smartphone, Square, Timer as TimerIcon } from "lucide-react";
import { useTracker } from "@/components/tracker-provider";
import { useShellUser } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { AreaIcon } from "@/components/area-icon";
import { StateDot } from "./state-dot";
import { DayStrip } from "./day-views";
import { ACTIVITY_LABEL } from "@/lib/constants";
import { breakKindOf, describePlan, encodePlan, PLAN_LIMITS, PRESETS, samePlan, sanitizePlan, type PomodoroPlan } from "@/lib/pomodoro";
import { api } from "@/lib/fetcher";
import { planOf } from "@/components/tracker-provider";
import { CycleDots } from "./cycle";
import { formatClock, formatDuration, formatTimeInTz, formatDateKey } from "@/lib/time";
import type { DayAnalytics, StudyAreaListItem, TaskItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Clock } from "./clock";

/* ───────── Session (the whole day) ───────── */

export function SessionCard({ day }: { day?: DayAnalytics }) {
  const t = useTracker();
  const user = useShellUser();
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const s = t.state;

  if (t.isLoading && !s) return <Skeleton className="h-[230px] rounded-xl" />;

  const endDay = async (endAtLastActivity = false) => {
    const r = await t.endDay({ endAtLastActivity });
    setConfirmEnd(false);
    if (r) router.push(`/summary/${r.dailySessionId}`);
  };

  if (!s?.day) {
    return (
      <Card className="p-5 sm:p-6">
        <p className="text-[13px] text-muted-foreground">Today&apos;s session</p>
        <p className="mt-2 text-[22px] font-semibold tracking-tight">Ready when you are.</p>
        <p className="mt-1 max-w-md text-[14px] text-muted-foreground">
          Start the day when you sit down. Everything after that — study, breaks, your phone — is measured against it.
        </p>
        <form
          className="mt-5 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void t.startDay(label || undefined);
          }}
        >
          <Input placeholder="Where are you? e.g. Library" value={label} onChange={(e) => setLabel(e.target.value)} className="sm:max-w-xs" maxLength={60} aria-label="Session name" />
          <Button size="lg" disabled={t.busy} className="sm:h-10">
            <Play /> Start day
          </Button>
        </form>
      </Card>
    );
  }

  const paused = s.day.status === "PAUSED";
  const nowMs = t.now;

  return (
    <Card className="p-5 sm:p-6">
      {s.day.isStale && (
        <div className="mb-5 flex flex-col gap-3 rounded-lg bg-[hsl(var(--state-break)/0.12)] p-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
          <span>
            Your session from {formatDateKey(s.day.date, "EEEE, MMM d")} is still open. End it at your last recorded activity so forgotten hours don&apos;t count.
          </span>
          <Button size="sm" variant="outline" onClick={() => endDay(true)} disabled={t.busy}>
            End at last activity
          </Button>
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            {s.day.label ? s.day.label : "Today's session"}
            {paused && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">Paused</span>}
          </p>
          <p className={cn("tnum mt-1 text-[44px] font-semibold leading-none tracking-[-0.03em] sm:text-[56px]", paused && "text-muted-foreground")}><Clock value={formatClock(t.daySeconds)} /></p>
          <p className="mt-2 text-[13px] text-muted-foreground">Started at {formatTimeInTz(s.day.startedAt, user.timezone)}</p>
        </div>
      </div>
      <div className="mt-6">
        {day ? <DayStrip entries={day.timeline} now={nowMs} tz={user.timezone} /> : <Skeleton className="h-3 rounded-full" />}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {paused ? (
          <Button onClick={t.resumeDay} disabled={t.busy}>
            <Play /> Resume session
          </Button>
        ) : (
          <Button variant="outline" onClick={t.pauseDay} disabled={t.busy}>
            <Pause /> Pause session
          </Button>
        )}
        <Button variant="ghost" onClick={() => setConfirmEnd(true)} disabled={t.busy}>
          <Square /> End session
        </Button>
      </div>
      <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <DialogContent title="End today's session?" description="Anything running will be stopped and saved. You'll see a summary of your day next.">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={() => endDay(false)} disabled={t.busy}>End session</Button>
            <Button variant="outline" onClick={() => setConfirmEnd(false)}>Keep going</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ───────── Current activity ───────── */

export function CurrentActivityCard() {
  const t = useTracker();
  const s = t.state;
  if (t.isLoading && !s) return <Skeleton className="h-[230px] rounded-xl" />;
  const a = s?.activity;

  if (!a) {
    return (
      <Card className="flex flex-col p-5 sm:p-6">
        <p className="text-[13px] text-muted-foreground">Right now</p>
        <p className="mt-2 text-[18px] font-semibold tracking-tight">What are you working on?</p>
        <div className="mt-4 flex-1">
          <QuickStart compact />
        </div>
        {s?.day && <DistractionButtons className="mt-3" />}
      </Card>
    );
  }

  const isFocus = a.type === "FOCUS";
  const kind = breakKindOf(a.mode);
  const heading = a.paused ? "Paused" : isFocus ? "Currently studying" : a.type === "BREAK" ? (kind === "long" ? "Long break" : "On a break") : a.type === "PHONE" ? "On your phone" : "Other";
  const name = isFocus ? (a.studyArea?.name ?? "Study") : kind === "long" ? "Long break" : ACTIVITY_LABEL[a.type];
  const time = t.remainingSeconds !== null ? formatClock(t.remainingSeconds, true) : formatClock(t.activitySeconds, true);

  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <StateDot type={a.type} pulsing={!a.paused} />
        {heading}
        {(isFocus || kind) && <CycleDots completed={t.cycleCompleted} every={t.plan.every} runningFocus={isFocus} className="ml-auto" />}
      </p>
      <div className="mt-3 flex items-center gap-3">
        {isFocus && <AreaIcon icon={a.studyArea?.icon} color={a.studyArea?.color} size="lg" />}
        <div className="min-w-0">
          <p className="truncate text-[18px] font-semibold tracking-tight">{name}</p>
          {a.task && <p className="truncate text-[13px] text-muted-foreground">{a.task.name}</p>}
        </div>
      </div>
      <p className={cn("tnum mt-4 text-[36px] font-semibold leading-none tracking-[-0.02em]", a.paused && "text-muted-foreground")}><Clock value={time} /></p>
      <p className="mt-1.5 text-[12px] text-muted-foreground">
        {t.remainingSeconds !== null
          ? `left of ${formatDuration(a.plannedSeconds!)}${isFocus ? ` · then ${t.nextBreak.minutes} min ${t.nextBreak.kind === "long" ? "long " : ""}break` : ""}`
          : a.type === "PHONE"
            ? "counting how long you're away"
            : "counting up"}
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {a.paused ? (
          <Button onClick={t.resumeActivity}>
            <Play /> Resume
          </Button>
        ) : (
          <Button variant="outline" onClick={t.pauseActivity}>
            <Pause /> Pause
          </Button>
        )}
        {isFocus ? (
          <Button variant="ghost" onClick={() => t.endActivity()}>
            <Square /> Finish
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => t.endActivity({ resumePrevious: true })}>
            {s?.lastFocus?.areaName ? `${a.type === "BREAK" ? "Skip · " : ""}Back to ${s.lastFocus.areaName}` : "End"}
          </Button>
        )}
        <Button variant="ghost" asChild className="ml-auto">
          <Link href="/timer">
            <TimerIcon /> Open timer
          </Link>
        </Button>
      </div>
    </Card>
  );
}

export function DistractionButtons({ className, size = "sm" }: { className?: string; size?: "sm" | "default" }) {
  const t = useTracker();
  const a = t.state?.activity;
  const nb = t.nextBreak;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {a?.type !== "BREAK" && (
        <Button variant="outline" size={size} onClick={() => t.startActivity({ type: "BREAK" })}>
          <Coffee /> {nb.kind === "long" ? `Long break · ${nb.minutes} min` : `Break · ${nb.minutes} min`}
        </Button>
      )}
      {a?.type !== "PHONE" && (
        <Button variant="outline" size={size} onClick={() => t.startActivity({ type: "PHONE" })}>
          <Smartphone /> Phone break
        </Button>
      )}
    </div>
  );
}

/* ───────── Quick start ───────── */

export function useStudyAreas() {
  return useSWR<StudyAreaListItem[]>("/api/study-areas");
}

/** Remember the plan someone just started with, so next time it's preselected. */
export async function rememberPlan(plan: PomodoroPlan, defaults: PomodoroPlan, refresh: () => void) {
  if (samePlan(plan, defaults)) return;
  try {
    await api("/api/settings", {
      method: "PATCH",
      body: { defaultFocusMinutes: plan.focus, defaultBreakMinutes: plan.short, longBreakMinutes: plan.long, longBreakEvery: plan.every },
    });
    refresh();
  } catch {
    /* not critical — the block itself carries its plan */
  }
}

export function QuickStart({ compact = false, initialAreaId, initialTaskId }: { compact?: boolean; initialAreaId?: string; initialTaskId?: string }) {
  const t = useTracker();
  const user = useShellUser();
  const router = useRouter();
  const { data: areas, isLoading } = useStudyAreas();
  const { data: tasks } = useSWR<TaskItem[]>("/api/tasks?status=open");
  const defaults = planOf(user);
  const matching = PRESETS.find((p) => samePlan(p.plan, defaults));
  const [areaId, setAreaId] = useState(initialAreaId ?? "");
  const [taskId, setTaskId] = useState(initialTaskId ?? "");
  const [choice, setChoice] = useState<string>(matching?.id ?? "mine");
  const [custom, setCustom] = useState({ focus: String(defaults.focus), short: String(defaults.short), long: String(defaults.long), every: String(defaults.every) });

  useEffect(() => {
    if (!areaId && areas?.length) setAreaId(t.state?.lastFocus?.studyAreaId ?? areas[0]!.id);
  }, [areas, areaId, t.state?.lastFocus?.studyAreaId]);

  if (isLoading) return <Skeleton className="h-24" />;
  if (!areas?.length) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-[13px] text-muted-foreground">
        Add a study area first so your time has somewhere to go.
        <Button asChild size="sm" className="mt-3 w-full">
          <Link href="/study?new=1">
            <Plus /> Create study area
          </Link>
        </Button>
      </div>
    );
  }

  const areaTasks = (tasks ?? []).filter((x) => x.studyAreaId === areaId);
  const options = [
    ...(matching ? [] : [{ id: "mine", label: `${defaults.focus} · ${defaults.short}`, plan: defaults }]),
    ...PRESETS,
  ];
  const plan: PomodoroPlan =
    choice === "custom"
      ? sanitizePlan({ focus: +custom.focus, short: +custom.short, long: +custom.long, every: +custom.every }, defaults)
      : (options.find((o) => o.id === choice)?.plan ?? defaults);

  const start = async () => {
    const ok = await t.startActivity({ type: "FOCUS", studyAreaId: areaId || null, taskId: taskId || null, mode: encodePlan(plan), plannedMinutes: plan.focus });
    if (ok) void rememberPlan(plan, defaults, () => router.refresh());
  };
  const setField = (k: keyof typeof custom) => (e: React.ChangeEvent<HTMLInputElement>) => setCustom((c) => ({ ...c, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <div className={cn("grid gap-3", !compact && "sm:grid-cols-2")}>
        <div className="space-y-1.5">
          {!compact && <Label htmlFor="qs-area">Study area</Label>}
          <Select
            id="qs-area"
            aria-label="Study area"
            value={areaId}
            onChange={(e) => {
              setAreaId(e.target.value);
              setTaskId("");
            }}
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          {!compact && <Label htmlFor="qs-task">Task</Label>}
          <Select id="qs-task" aria-label="Task" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">No specific task</option>
            {areaTasks.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        {!compact && <Label>Pomodoro</Label>}
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Pomodoro plan">
          {[...options, { id: "custom", label: "Custom" }].map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={choice === x.id}
              onClick={() => setChoice(x.id)}
              className={cn("tnum h-8 rounded-lg border px-3 text-[13px] transition-colors", choice === x.id ? "border-primary bg-accent font-medium text-accent-foreground" : "hover:bg-muted")}
            >
              {x.label}
            </button>
          ))}
        </div>
        {choice === "custom" && (
          <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
            <PlanInput label="Focus" unit="min" value={custom.focus} onChange={setField("focus")} {...PLAN_LIMITS.focus} />
            <PlanInput label="Break" unit="min" value={custom.short} onChange={setField("short")} {...PLAN_LIMITS.short} />
            <PlanInput label="Long break" unit="min" value={custom.long} onChange={setField("long")} {...PLAN_LIMITS.long} />
            <PlanInput label="Long break after" unit="focus" value={custom.every} onChange={setField("every")} {...PLAN_LIMITS.every} />
          </div>
        )}
        <p className="pt-1 text-[12px] leading-relaxed text-muted-foreground">{describePlan(plan)}.</p>
      </div>
      <Button className="w-full" size={compact ? "default" : "lg"} onClick={start}>
        <Play /> Start {plan.focus} min focus
      </Button>
    </div>
  );
}

function PlanInput({ label, unit, value, onChange, min, max }: { label: string; unit: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; min: number; max: number }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="relative block">
        <Input type="number" inputMode="numeric" min={min} max={max} value={value} onChange={onChange} className="h-9 pr-12" aria-label={`${label} (${unit})`} />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{unit}</span>
      </span>
    </label>
  );
}

export function FinishWithTaskButton() {
  const t = useTracker();
  const a = t.state?.activity;
  if (!a?.task) return null;
  return (
    <Button variant="outline" onClick={() => t.endActivity({ completeTask: true })}>
      <CheckCircle2 /> Finish &amp; mark task done
    </Button>
  );
}
