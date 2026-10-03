"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Coffee, Pause, Play, Smartphone, Square } from "lucide-react";
import { useTracker } from "@/components/tracker-provider";
import { useShellUser } from "@/components/shell/app-shell";
import { DistractionButtons, FinishWithTaskButton, QuickStart } from "@/components/tracking/widgets";
import { DayStrip } from "@/components/tracking/day-views";
import { StateDot } from "@/components/tracking/state-dot";
import { CycleDots } from "@/components/tracking/cycle";
import { AlarmStatus } from "@/components/settings/alarm-settings";
import { breakKindOf } from "@/lib/pomodoro";
import { AreaIcon } from "@/components/area-icon";
import { PageHeader } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { useToday } from "@/hooks/use-today";
import { ACTIVITY_COLOR_VAR, ACTIVITY_LABEL } from "@/lib/constants";
import { formatClock, formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Clock } from "@/components/tracking/clock";

export default function TimerPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] rounded-xl" />}>
      <TimerInner />
    </Suspense>
  );
}

function TimerInner() {
  const t = useTracker();
  const params = useSearchParams();
  const a = t.state?.activity;

  if (t.isLoading && !t.state) return <Skeleton className="h-[480px] rounded-xl" />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Timer" description={a ? "Your clock is stored on the server — refresh or close the tab, it keeps counting." : "Pick what you're working on and start."} />
      {a ? <RunningTimer /> : (
        <Card className="p-5 sm:p-7">
          <p className="mb-5 text-[18px] font-semibold tracking-tight">What are you working on?</p>
          <QuickStart initialAreaId={params.get("area") ?? undefined} initialTaskId={params.get("task") ?? undefined} />
          {t.state?.day && (
            <div className="mt-6 border-t pt-5">
              <p className="mb-3 text-[13px] text-muted-foreground">Not studying right now? Log it honestly.</p>
              <DistractionButtons />
            </div>
          )}
        </Card>
      )}
      <TodayStrip />
    </div>
  );
}

function RunningTimer() {
  const t = useTracker();
  const s = t.state!;
  const a = s.activity!;
  const isFocus = a.type === "FOCUS";
  const kind = breakKindOf(a.mode);
  const countdown = t.remainingSeconds !== null;
  const planned = a.plannedSeconds ?? 0;
  const progress = countdown && planned ? Math.min(1, t.activitySeconds / planned) : null;
  const color = isFocus ? (a.studyArea?.color ?? ACTIVITY_COLOR_VAR.FOCUS) : ACTIVITY_COLOR_VAR[a.type];
  const R = 120;
  const C = 2 * Math.PI * R;
  const title = isFocus ? (a.studyArea?.name ?? "Study") : kind === "long" ? "Long break" : kind === "short" ? "Short break" : ACTIVITY_LABEL[a.type];
  const stateLabel = a.paused ? "Paused" : isFocus ? `Focus ${Math.min(t.cycleCompleted + 1, t.plan.every)} of ${t.plan.every}` : kind ? "Rest" : "Away";
  const nextLine = isFocus
    ? `Next: ${t.nextBreak.minutes} min ${t.nextBreak.kind === "long" ? "long break" : "break"}`
    : kind
      ? `Next: ${t.plan.focus} min focus${kind === "long" ? " · new cycle" : ""}`
      : null;

  return (
    <Card className="flex flex-col items-center px-5 pb-6 pt-7 sm:px-8 sm:pt-9">
      <div className="flex items-center gap-3">
        {isFocus ? <AreaIcon icon={a.studyArea?.icon} color={a.studyArea?.color} /> : a.type === "BREAK" ? <Coffee className="size-5 text-[hsl(var(--state-break))]" /> : <Smartphone className="size-5 text-[hsl(var(--state-phone))]" />}
        <p className="text-[16px] font-semibold tracking-tight">
          {title}
          {a.task && <span className="font-normal text-muted-foreground"> → {a.task.name}</span>}
        </p>
      </div>
      {(isFocus || kind) && <CycleDots completed={t.cycleCompleted} every={t.plan.every} runningFocus={isFocus} className="mt-3" />}

      <div className="relative mt-6 aspect-square w-full max-w-[290px]">
        <svg viewBox="0 0 280 280" className="size-full -rotate-90" aria-hidden>
          <circle cx="140" cy="140" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
          {progress !== null ? (
            <circle
              cx="140" cy="140" r={R} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * progress}
              style={{ transition: "stroke-dashoffset 1s linear" }}
              opacity={a.paused ? 0.4 : 1}
            />
          ) : (
            <circle cx="140" cy="140" r={R} fill="none" stroke={color} strokeWidth="6" opacity={a.paused ? 0.25 : 0.55} strokeDasharray="2 10" />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className={cn("tnum text-[54px] font-semibold leading-none tracking-[-0.03em] sm:text-[60px]", a.paused && "text-muted-foreground")} aria-live="off">
            <Clock value={countdown ? formatClock(t.remainingSeconds!, true) : formatClock(t.activitySeconds, true)} />
          </p>
          <p className="mt-3 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            <StateDot type={a.type} pulsing={!a.paused} /> {stateLabel}
          </p>
          <p className="tnum mt-1 text-[12px] text-muted-foreground">
            {countdown ? `of ${formatDuration(planned)}` : "counting how long you're away"}
          </p>
        </div>
      </div>
      {nextLine && <p className="mt-4 text-[13px] text-muted-foreground">{nextLine}</p>}

      <div className="mt-6 flex w-full flex-wrap justify-center gap-2">
        {a.paused ? (
          <Button size="lg" onClick={t.resumeActivity}><Play /> Resume</Button>
        ) : (
          <Button size="lg" variant="outline" onClick={t.pauseActivity}><Pause /> Pause</Button>
        )}
        {isFocus ? (
          <Button size="lg" variant="ghost" onClick={() => t.endActivity()}><Square /> Finish</Button>
        ) : (
          <Button size="lg" onClick={() => t.endActivity({ resumePrevious: true })}>
            <Play /> {s.lastFocus?.areaName ? `${kind ? "Skip break · " : ""}Back to ${s.lastFocus.areaName}` : "End"}
          </Button>
        )}
      </div>
      {isFocus && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <FinishWithTaskButton />
        </div>
      )}
      {!isFocus && (
        <Button variant="link" className="mt-3 text-muted-foreground" onClick={() => t.endActivity()}>
          End without resuming
        </Button>
      )}
      <div className="mt-6 w-full border-t pt-5">
        <p className="mb-3 text-center text-[13px] text-muted-foreground">Switch to</p>
        <DistractionButtons className="justify-center" />
      </div>
      {a.paused && <p className="mt-4 text-center text-[12px] text-muted-foreground">Paused time isn&apos;t counted.</p>}
      {countdown && <div className="mt-5"><AlarmStatus /></div>}
    </Card>
  );
}

function TodayStrip() {
  const t = useTracker();
  const user = useShellUser();
  const { live } = useToday();
  if (!t.state?.day || !live?.timeline.length) return null;
  return (
    <Card className="mt-4 p-5">
      <div className="mb-3 flex items-baseline justify-between text-[13px]">
        <span className="font-medium">Today so far</span>
        <span className="tnum text-muted-foreground">{formatDuration(live.totals.focus)} studied · {formatDuration(live.totals.session)} in session</span>
      </div>
      <DayStrip entries={live.timeline} now={t.now} tz={user.timezone} />
      <Link href="/dashboard" className="mt-3 inline-block text-[12px] text-muted-foreground hover:text-foreground">See the full timeline →</Link>
    </Card>
  );
}
