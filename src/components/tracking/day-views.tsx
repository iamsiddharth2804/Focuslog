"use client";
import { Coffee, Flag, Pause, Play, Smartphone, Square, Hourglass } from "lucide-react";
import { Tooltip } from "@/components/ui/misc";
import { ACTIVITY_COLOR_VAR, ACTIVITY_LABEL } from "@/lib/constants";
import { formatDuration, formatTimeInTz } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TimelineEntry } from "@/lib/types";
import { Clock } from "./clock";

type Seg = { key: string; start: number; end: number; color: string; label: string; detail: string; hatched?: boolean };

/**
 * The day strip: the whole session drawn to scale, left to right.
 * Every pixel is a real timestamp range — study, break, phone, idle, paused.
 */
export function DayStrip({ entries, now, tz, className, height = "h-3" }: { entries: TimelineEntry[]; now: number; tz: string; className?: string; height?: string }) {
  const segs: Seg[] = [];
  let first = Infinity;
  let last = 0;
  const t = (s: string) => new Date(s).getTime();

  for (const e of entries) {
    if (e.kind === "session-start") first = Math.min(first, t(e.at));
    if (e.kind === "session-end") last = Math.max(last, t(e.at));
    if (e.kind === "activity") {
      const end = e.end ? t(e.end) : now;
      const name = e.type === "FOCUS" ? (e.areaName ?? "Study") : ACTIVITY_LABEL[e.type];
      segs.push({
        key: e.id,
        start: t(e.at),
        end,
        color: e.type === "FOCUS" && e.areaColor ? e.areaColor : ACTIVITY_COLOR_VAR[e.type],
        label: name + (e.taskName ? ` · ${e.taskName}` : ""),
        detail: `${formatTimeInTz(e.at, tz)} – ${e.end ? formatTimeInTz(e.end, tz) : "now"} · ${formatDuration(e.seconds)}${e.pausedSeconds >= 60 ? ` (+${formatDuration(e.pausedSeconds)} paused)` : ""}`,
      });
      last = Math.max(last, end);
    }
    if (e.kind === "idle") segs.push({ key: e.at, start: t(e.at), end: t(e.end), color: ACTIVITY_COLOR_VAR.IDLE, label: "Idle", detail: formatDuration(e.seconds) });
    if (e.kind === "session-pause") {
      const end = e.end ? t(e.end) : now;
      segs.push({ key: `p${e.at}`, start: t(e.at), end, color: "hsl(var(--muted-foreground) / 0.25)", label: "Session paused", detail: formatDuration(e.seconds), hatched: true });
    }
  }
  if (!segs.length || first === Infinity) {
    return <div className={cn("w-full rounded-full bg-muted", height, className)} />;
  }
  const hasEnd = entries.some((e) => e.kind === "session-end");
  const end = hasEnd ? last : Math.max(now, last);
  const total = Math.max(1, end - first);

  // Fill gaps (e.g. idle < 1 min that the timeline hides) with idle so the strip is continuous.
  segs.sort((a, b) => a.start - b.start);
  return (
    <div className={cn("relative w-full overflow-hidden rounded-full bg-[hsl(var(--state-idle))]", height, className)} role="img" aria-label="Your session, drawn to scale">
      {segs.map((s) => {
        const left = ((s.start - first) / total) * 100;
        const width = Math.max(0.4, ((Math.min(s.end, end) - s.start) / total) * 100);
        return (
          <Tooltip
            key={s.key}
            content={
              <span>
                <span className="font-medium">{s.label}</span>
                <br />
                <span className="text-muted-foreground">{s.detail}</span>
              </span>
            }
          >
            <span
              className="absolute inset-y-0 border-r-[1.5px] border-card/80 last:border-r-0"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: s.hatched ? `repeating-linear-gradient(135deg, ${s.color} 0 3px, transparent 3px 6px)` : s.color,
              }}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}

const ICON = { FOCUS: Play, BREAK: Coffee, PHONE: Smartphone, OTHER: Hourglass } as const;

/** Vertical timeline of the day — time on the left, what happened on the right. */
export function Timeline({ entries, tz, compact = false }: { entries: TimelineEntry[]; tz: string; compact?: boolean }) {
  if (!entries.length) return null;
  return (
    <ol className="relative">
      {entries.map((e, i) => {
        const time = formatTimeInTz(e.at, tz, "h:mm");
        const ampm = formatTimeInTz(e.at, tz, "a");
        let dot = "hsl(var(--muted-foreground))";
        let title: React.ReactNode = null;
        let meta: React.ReactNode = null;
        let Icon: React.ComponentType<{ className?: string }> = Flag;
        let barSeconds = 0;

        if (e.kind === "session-start") {
          title = e.label ? `Started ${e.label}` : "Started session";
          Icon = Flag;
          dot = "hsl(var(--foreground))";
        } else if (e.kind === "session-end") {
          title = "Ended session";
          Icon = Square;
          dot = "hsl(var(--foreground))";
        } else if (e.kind === "session-pause") {
          title = "Session paused";
          meta = e.end ? formatDuration(e.seconds) : "paused now";
          Icon = Pause;
        } else if (e.kind === "idle") {
          title = <span className="text-muted-foreground">Untracked</span>;
          meta = formatDuration(e.seconds);
          Icon = Hourglass;
          dot = ACTIVITY_COLOR_VAR.IDLE;
        } else if (e.kind === "activity") {
          Icon = ICON[e.type];
          dot = e.type === "FOCUS" && e.areaColor ? e.areaColor : ACTIVITY_COLOR_VAR[e.type];
          title = (
            <>
              {e.type === "FOCUS" ? (e.areaName ?? "Study") : (e.label ?? ACTIVITY_LABEL[e.type])}
              {e.taskName && <span className="font-normal text-muted-foreground"> · {e.taskName}</span>}
            </>
          );
          meta = (
            <>
              {e.running ? <span className="font-medium text-primary">In progress · </span> : null}
              {formatDuration(e.seconds, { seconds: true })}
              {e.pausedSeconds >= 60 && <span> · {formatDuration(e.pausedSeconds)} paused</span>}
              {e.endReason === "COMPLETED" && <span> · pomodoro complete</span>}
            </>
          );
          barSeconds = e.seconds;
        }

        return (
          <li key={`${e.kind}-${e.at}-${i}`} className={cn("grid grid-cols-[52px_20px_1fr] gap-x-3", compact ? "pb-3" : "pb-5")}>
            <time className="tnum pt-0.5 text-right text-[13px] leading-tight text-muted-foreground">
              <Clock value={time} />
              <span className="block text-[10px] uppercase tracking-wide opacity-70">{ampm}</span>
            </time>
            <div className="relative flex justify-center">
              {i < entries.length - 1 && <span className="absolute bottom-[-4px] top-6 w-px bg-border" />}
              <span className="relative z-10 mt-0.5 inline-flex size-5 items-center justify-center rounded-full border bg-card" style={{ borderColor: dot, color: dot }}>
                <Icon className="size-2.5" />
              </span>
            </div>
            <div className="min-w-0 pt-px">
              <p className="truncate text-[14px] font-medium leading-snug">{title}</p>
              {meta && <p className="tnum mt-0.5 text-[12px] text-muted-foreground">{meta}</p>}
              {!compact && barSeconds > 0 && (
                <div className="mt-2 h-1 rounded-full" style={{ width: `${Math.min(100, Math.max(4, (barSeconds / 5400) * 100))}%`, background: dot, opacity: 0.55 }} />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
