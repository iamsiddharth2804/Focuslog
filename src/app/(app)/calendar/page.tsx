"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useTracker } from "@/components/tracker-provider";
import { LEVEL_BG, level } from "@/components/analytics/charts";
import { ErrorNotice, PageHeader, Stat } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { ACTIVITY_COLOR_VAR } from "@/lib/constants";
import { formatDateKey, formatDuration } from "@/lib/time";
import type { MonthAnalytics } from "@/lib/types";
import { cn } from "@/lib/utils";

type Day = MonthAnalytics["days"][number];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shiftMonth(m: string, dir: number) {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, mo - 1 + dir, 1)).toISOString().slice(0, 7);
}

export default function CalendarPage() {
  const t = useTracker();
  const today = t.state?.today;
  const [month, setMonth] = useState<string | null>(null);
  const m = month ?? today?.slice(0, 7) ?? null;
  const { data, error, mutate } = useSWR<MonthAnalytics>(m ? `/api/analytics/month?month=${m}` : null);
  const [selected, setSelected] = useState<Day | null>(null);

  const isCurrent = !!today && m === today.slice(0, 7);

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Each day shaded by how much you actually studied."
        actions={
          m && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(m, -1))} aria-label="Previous month"><ChevronLeft /></Button>
              <p className="min-w-[140px] text-center text-[15px] font-medium">{formatDateKey(`${m}-01`, "MMMM yyyy")}</p>
              <Button variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(m, 1))} disabled={isCurrent} aria-label="Next month"><ChevronRight /></Button>
              {!isCurrent && <Button variant="outline" size="sm" onClick={() => setMonth(null)}>Today</Button>}
            </div>
          )
        }
      />
      {error && <ErrorNotice onRetry={() => mutate()} />}
      {!data || !m ? (
        <Skeleton className="h-[520px] rounded-xl" />
      ) : (
        <>
          <Card className="mb-4 p-5">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Stat label="Studied" value={formatDuration(data.totals.focus)} />
              <Stat label="Days studied" value={`${data.studiedDays}`} sub={`of ${data.elapsedDays}`} />
              <Stat label="Average / day" value={formatDuration(data.averagePerDay)} />
              <Stat label="Longest day" value={data.longestDay ? formatDuration(data.longestDay.seconds) : "—"} sub={data.longestDay ? formatDateKey(data.longestDay.date, "MMM d") : undefined} />
            </div>
          </Card>
          <Card className="p-2 sm:p-4">
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {WEEKDAYS.map((d) => <p key={d} className="pb-1 text-center text-[11px] font-medium text-muted-foreground sm:text-[12px]">{d}</p>)}
              {Array.from({ length: (new Date(`${m}-01T00:00:00Z`).getUTCDay() + 6) % 7 }).map((_, i) => <span key={`b${i}`} />)}
              {data.days.map((d) => {
                const future = !!today && d.date > today;
                const lvl = level(d.focus);
                const isToday = d.date === today;
                return (
                  <button
                    key={d.date}
                    disabled={future}
                    onClick={() => setSelected(d)}
                    aria-label={`${formatDateKey(d.date, "MMMM d")}: ${formatDuration(d.focus)} studied`}
                    className={cn(
                      "group relative isolate flex aspect-square flex-col rounded-lg border p-1 text-left transition-colors sm:aspect-[1.15] sm:p-2",
                      future ? "border-dashed opacity-40" : "hover:border-foreground/25",
                      isToday && "border-primary",
                    )}
                  >
                    <span className={cn("tnum text-[12px] sm:text-[13px]", isToday ? "font-semibold text-primary" : "text-muted-foreground")}>{Number(d.date.slice(8))}</span>
                    {d.focus > 0 && (
                      <>
                        <span className="tnum mt-auto hidden text-[12px] font-medium sm:block">{formatDuration(d.focus)}</span>
                        <span className="mt-auto h-1.5 w-full overflow-hidden rounded-full sm:mt-1 sm:flex" style={{ background: LEVEL_BG[0] }}>
                          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (d.focus / (6 * 3600)) * 100)}%`, background: LEVEL_BG[Math.max(2, lvl)] }} />
                        </span>
                      </>
                    )}
                    {d.focus > 0 && <span className="absolute inset-0 -z-10 rounded-lg" style={{ background: LEVEL_BG[lvl], opacity: 0.18 }} />}
                  </button>
                );
              })}
            </div>
          </Card>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <DialogContent title={formatDateKey(selected.date, "EEEE, MMMM d")}>
            {selected.session === 0 ? (
              <p className="text-[14px] text-muted-foreground">No session tracked this day.</p>
            ) : (
              <>
                <p className="tnum text-[28px] font-semibold tracking-tight">{formatDuration(selected.session)} <span className="text-[15px] font-normal text-muted-foreground">total session</span></p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                  {([["Study", selected.focus, "FOCUS"], ["Break", selected.break, "BREAK"], ["Phone", selected.phone, "PHONE"]] as const).map(([l, v, k]) => (
                    <span key={l} className="tnum flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: ACTIVITY_COLOR_VAR[k] }} />{l} {formatDuration(v)}</span>
                  ))}
                </div>
                {selected.subjects.length > 0 && (
                  <ul className="mt-5 space-y-2 border-t pt-4">
                    {selected.subjects.map((s) => (
                      <li key={s.id} className="flex items-center gap-2.5 text-[14px]">
                        <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
                        {s.name}
                        <span className="tnum ml-auto text-muted-foreground">{formatDuration(s.seconds)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 text-[12px] text-muted-foreground">{selected.focusSessions} focus sessions · {selected.tasksCompleted} tasks completed</p>
              </>
            )}
            <div className="mt-5 flex justify-end">
              <Button asChild variant="outline"><Link href={`/analytics?tab=day&date=${selected.date}`}>Open full day <ArrowRight /></Link></Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
