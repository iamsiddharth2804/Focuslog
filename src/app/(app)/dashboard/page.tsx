"use client";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, BookOpen, Flame } from "lucide-react";
import { useShellUser } from "@/components/shell/app-shell";
import { useTracker } from "@/components/tracker-provider";
import { CurrentActivityCard, SessionCard } from "@/components/tracking/widgets";
import { Timeline } from "@/components/tracking/day-views";
import { SubjectBars } from "@/components/dashboard/subject-bars";
import { ProductivityExplainer } from "@/components/dashboard/productivity";
import { EmptyState, ErrorNotice, Stat } from "@/components/common/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, Skeleton } from "@/components/ui/misc";
import { useToday } from "@/hooks/use-today";
import { ACTIVITY_COLOR_VAR } from "@/lib/constants";
import { formatDateKey, formatDuration } from "@/lib/time";
import type { GoalsOverview } from "@/lib/types";
import { TZDate } from "@date-fns/tz";

function greeting(tz: string) {
  const h = new TZDate(Date.now(), tz).getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const user = useShellUser();
  const t = useTracker();
  const { live, error, mutate } = useToday();
  const { data: goals } = useSWR<GoalsOverview>("/api/goals");
  const first = user.name.split(" ")[0];
  const today = t.state?.today;
  const daily = goals?.goals.find((g) => g.type === "DAILY");

  return (
    <div>
      <header className="mb-7">
        <h1 className="text-[26px] font-semibold tracking-tight sm:text-[28px]">
          {greeting(user.timezone)}, {first} 👋
        </h1>
        <p className="mt-1 text-[14px] text-muted-foreground">{today ? formatDateKey(today) : "\u00a0"}</p>
      </header>

      {error && <ErrorNotice onRetry={() => mutate()} />}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <SessionCard day={live} />
        <CurrentActivityCard />
      </div>

      <section className="mt-4" aria-labelledby="overview">
        <Card>
          <CardHeader>
            <CardTitle id="overview">Today&apos;s overview</CardTitle>
            {goals && (
              <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Flame className="size-4 text-[hsl(var(--state-break))]" />
                {goals.streak.current} day streak
              </span>
            )}
          </CardHeader>
          <CardContent>
            {live ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                <Stat label="Study time" value={formatDuration(live.totals.focus)} color={ACTIVITY_COLOR_VAR.FOCUS} sub={`${live.focusSessions} focus sessions`} />
                <Stat label="Break time" value={formatDuration(live.totals.break)} color={ACTIVITY_COLOR_VAR.BREAK} />
                <Stat label="Phone time" value={formatDuration(live.totals.phone)} color={ACTIVITY_COLOR_VAR.PHONE} />
                <Stat label="Untracked" value={formatDuration(live.totals.idle + live.totals.other)} color={ACTIVITY_COLOR_VAR.IDLE} sub={`of ${formatDuration(live.totals.session)} in session`} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            )}
            {daily && (
              <div className="mt-6 border-t pt-5">
                <div className="mb-2 flex items-baseline justify-between text-[13px]">
                  <span className="text-muted-foreground">Daily goal</span>
                  <span className="tnum">
                    <span className="font-medium">{formatDuration(live?.totals.focus ?? daily.progressSec)}</span>
                    <span className="text-muted-foreground"> / {formatDuration(daily.targetMinutes * 60)}</span>
                  </span>
                </div>
                <Progress value={((live?.totals.focus ?? daily.progressSec) / (daily.targetMinutes * 60)) * 100} />
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s study</CardTitle>
            <Link href="/study" className="text-[13px] text-muted-foreground hover:text-foreground">
              Study areas
            </Link>
          </CardHeader>
          <CardContent>
            {!live ? (
              <Skeleton className="h-32" />
            ) : live.subjects.length ? (
              <SubjectBars subjects={live.subjects} />
            ) : (
              <EmptyState icon={BookOpen} title="No study time yet today" body="Start a focus session and each subject's time will show up here." className="py-8" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Productivity</CardTitle>
          </CardHeader>
          <CardContent>
            {live ? <ProductivityExplainer focus={live.totals.focus} session={live.totals.session} score={live.productivity} /> : <Skeleton className="h-28" />}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <Link href="/analytics" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
            Full analytics <ArrowRight className="size-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {!live ? (
            <Skeleton className="h-40" />
          ) : live.timeline.length ? (
            <Timeline entries={live.timeline} tz={user.timezone} />
          ) : (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Your day will be drawn here as it happens.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
