"use client";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useShellUser } from "@/components/shell/app-shell";
import { useTracker } from "@/components/tracker-provider";
import { DayStrip, Timeline } from "@/components/tracking/day-views";
import { SubjectBars } from "@/components/dashboard/subject-bars";
import { ProductivityExplainer } from "@/components/dashboard/productivity";
import { Donut, Heatmap, Insights, StackedTimeBars, TaskCompletion } from "@/components/analytics/charts";
import { EmptyState, ErrorNotice, PageHeader, Stat } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACTIVITY_COLOR_VAR } from "@/lib/constants";
import { addDaysToKey, formatDateKey, formatDuration, weekStartKey } from "@/lib/time";
import type { DayAnalytics, MonthAnalytics, WeekAnalytics, YearAnalytics } from "@/lib/types";
import { BarChart3 } from "lucide-react";

type Tab = "day" | "week" | "month" | "year";

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<PanelSkeleton />}>
      <AnalyticsInner />
    </Suspense>
  );
}

function AnalyticsInner() {
  const t = useTracker();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const today = t.state?.today;
  if (!today) return <PanelSkeleton />;

  const tab = (["day", "week", "month", "year"].includes(params.get("tab") ?? "") ? params.get("tab") : "day") as Tab;
  const date = params.get("date") && /^\d{4}-\d{2}-\d{2}$/.test(params.get("date")!) ? params.get("date")! : today;
  const go = (next: { tab?: Tab; date?: string }) => {
    const q = new URLSearchParams(params.toString());
    if (next.tab) q.set("tab", next.tab);
    if (next.date) q.set("date", next.date > today ? today : next.date);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  // Navigation is anchored on one date; each tab interprets it as its own period.
  const shift = (dir: -1 | 1) => {
    if (tab === "day") return go({ date: addDaysToKey(date, dir) });
    if (tab === "week") return go({ date: addDaysToKey(date, 7 * dir) });
    const [y, m] = date.split("-").map(Number) as [number, number];
    if (tab === "month") {
      const d = new Date(Date.UTC(y, m - 1 + dir, 1));
      return go({ date: d.toISOString().slice(0, 10) });
    }
    return go({ date: `${y + dir}-01-01` });
  };
  const atLatest = tab === "day" ? date >= today : tab === "week" ? weekStartKey(date) >= weekStartKey(today) : tab === "month" ? date.slice(0, 7) >= today.slice(0, 7) : date.slice(0, 4) >= today.slice(0, 4);

  const periodLabel =
    tab === "day" ? (date === today ? "Today" : formatDateKey(date)) :
    tab === "week" ? `${formatDateKey(weekStartKey(date), "MMM d")} – ${formatDateKey(addDaysToKey(weekStartKey(date), 6), "MMM d")}` :
    tab === "month" ? formatDateKey(`${date.slice(0, 7)}-01`, "MMMM yyyy") : date.slice(0, 4);

  return (
    <div>
      <PageHeader title="Analytics" description="Every number here is computed from your individual sessions." />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => go({ tab: v as Tab })}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="year">Year</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Previous period"><ChevronLeft /></Button>
          <p className="tnum min-w-[150px] text-center text-[14px] font-medium">{periodLabel}</p>
          <Button variant="ghost" size="icon" onClick={() => shift(1)} disabled={atLatest} aria-label="Next period"><ChevronRight /></Button>
          {!atLatest && <Button variant="outline" size="sm" onClick={() => go({ date: today })} className="ml-1">Now</Button>}
        </div>
      </div>
      {tab === "day" && <DayView date={date} />}
      {tab === "week" && <WeekView date={date} />}
      {tab === "month" && <MonthView month={date.slice(0, 7)} />}
      {tab === "year" && <YearView year={Number(date.slice(0, 4))} today={today} onSelect={(d) => go({ tab: "day", date: d })} />}
    </div>
  );
}

/* ───────── Day ───────── */

function DayView({ date }: { date: string }) {
  const user = useShellUser();
  const t = useTracker();
  const isToday = date === t.state?.today;
  const { data, error, mutate } = useSWR<DayAnalytics>(`/api/analytics/day?date=${date}`, { refreshInterval: isToday ? 60_000 : 0 });
  if (error) return <ErrorNotice onRetry={() => mutate()} />;
  if (!data) return <PanelSkeleton />;
  const T = data.totals;
  if (T.session === 0 && !data.timeline.length) return <EmptyState icon={BarChart3} title="Nothing tracked this day" body="Start a daily session and your day will be reconstructed here." />;
  const hours = trimHours(data.hourly);
  const reflection = data.reflections[0];

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-5">
          <Stat label="Total session" value={formatDuration(T.session)} />
          <Stat label="Study" value={formatDuration(T.focus)} color={ACTIVITY_COLOR_VAR.FOCUS} sub={`${data.focusSessions} sessions`} />
          <Stat label="Break" value={formatDuration(T.break)} color={ACTIVITY_COLOR_VAR.BREAK} />
          <Stat label="Phone" value={formatDuration(T.phone)} color={ACTIVITY_COLOR_VAR.PHONE} />
          <Stat label="Other / idle" value={formatDuration(T.other + T.idle)} color={ACTIVITY_COLOR_VAR.IDLE} />
        </div>
        {data.timeline.length > 0 && <DayStrip entries={data.timeline} now={t.now} tz={user.timezone} className="mt-6" height="h-4" />}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Study time by subject</CardTitle></CardHeader>
          <CardContent>{data.subjects.length ? <SubjectBars subjects={data.subjects} /> : <Muted>No focus sessions.</Muted>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Focus vs break</CardTitle></CardHeader>
          <CardContent>
            <Donut centerLabel="in session" centerValue={formatDuration(T.session)} items={[
              { id: "f", name: "Study", color: ACTIVITY_COLOR_VAR.FOCUS, seconds: T.focus },
              { id: "b", name: "Break", color: ACTIVITY_COLOR_VAR.BREAK, seconds: T.break },
              { id: "p", name: "Phone", color: ACTIVITY_COLOR_VAR.PHONE, seconds: T.phone },
              { id: "o", name: "Other", color: ACTIVITY_COLOR_VAR.OTHER, seconds: T.other },
              { id: "i", name: "Untracked", color: ACTIVITY_COLOR_VAR.IDLE, seconds: T.idle },
            ].filter((x) => x.seconds > 0)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Hour by hour</CardTitle></CardHeader>
        <CardContent><StackedTimeBars data={hours} xKey="hour" xFormat={hourLabel} keys={["focus", "break", "phone", "other"]} /></CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Task completion</CardTitle></CardHeader>
          <CardContent><TaskCompletion {...data.tasks} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Productivity</CardTitle></CardHeader>
          <CardContent><ProductivityExplainer focus={T.focus} session={T.session} score={data.productivity} /></CardContent>
        </Card>
      </div>

      {reflection && (
        <Card className="p-5">
          <p className="text-[13px] text-muted-foreground">Reflection</p>
          <p className="mt-1 text-[15px]"><span className="mr-2 text-[20px]">{["😞", "😐", "🙂", "😄", "🔥"][reflection.rating - 1]}</span>{reflection.note || <span className="text-muted-foreground">No note.</span>}</p>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
        <CardContent><Timeline entries={data.timeline} tz={user.timezone} /></CardContent>
      </Card>
    </div>
  );
}

/* ───────── Week / Month / Year ───────── */

function WeekView({ date }: { date: string }) {
  const { data, error, mutate } = useSWR<WeekAnalytics>(`/api/analytics/week?date=${date}`);
  if (error) return <ErrorNotice onRetry={() => mutate()} />;
  if (!data) return <PanelSkeleton />;
  return (
    <PeriodBody data={data} stats={[
      { label: "Total study", value: formatDuration(data.totals.focus), sub: delta(data.totals.focus, data.previous.focus, "last week") },
      { label: "Daily average", value: formatDuration(data.averagePerDay), sub: `over ${data.elapsedDays} day${data.elapsedDays === 1 ? "" : "s"}` },
      { label: "Tasks completed", value: String(data.tasks.completed) },
      { label: "Focus sessions", value: String(data.focusSessions) },
    ]} chartTitle="This week, day by day" chart={
      <StackedTimeBars data={data.days.map((d) => ({ ...d, day: d.date }))} xKey="day" xFormat={(v) => formatDateKey(String(v), "EEE")} labelFormat={(v) => formatDateKey(String(v), "EEEE, MMM d")} />
    } />
  );
}

function MonthView({ month }: { month: string }) {
  const { data, error, mutate } = useSWR<MonthAnalytics>(`/api/analytics/month?month=${month}`);
  if (error) return <ErrorNotice onRetry={() => mutate()} />;
  if (!data) return <PanelSkeleton />;
  return (
    <PeriodBody data={data} stats={[
      { label: "Total study", value: formatDuration(data.totals.focus), sub: delta(data.totals.focus, data.previous.focus, "last month") },
      { label: "Average / day", value: formatDuration(data.averagePerDay), sub: `${data.studiedDays} days studied` },
      { label: "Longest day", value: data.longestDay ? formatDuration(data.longestDay.seconds) : "—", sub: data.longestDay ? formatDateKey(data.longestDay.date, "MMM d") : undefined },
      { label: "Focus sessions", value: String(data.focusSessions) },
      { label: "Tasks completed", value: String(data.tasks.completed) },
    ]} chartTitle="Daily study" chart={
      <StackedTimeBars data={data.days} xKey="date" xFormat={(v) => String(Number(String(v).slice(8)))} labelFormat={(v) => formatDateKey(String(v), "EEEE, MMM d")} />
    } />
  );
}

function YearView({ year, today, onSelect }: { year: number; today: string; onSelect: (d: string) => void }) {
  const { data, error, mutate } = useSWR<YearAnalytics>(`/api/analytics/year?year=${year}`);
  if (error) return <ErrorNotice onRetry={() => mutate()} />;
  if (!data) return <PanelSkeleton />;
  return (
    <PeriodBody data={data} stats={[
      { label: "Total study", value: formatDuration(data.totals.focus), sub: delta(data.totals.focus, data.previous.focus, String(year - 1)) },
      { label: "Average / day", value: formatDuration(data.averagePerDay) },
      { label: "Days studied", value: String(data.studiedDays) },
      { label: "Focus sessions", value: String(data.focusSessions) },
      { label: "Tasks completed", value: String(data.tasks.completed) },
    ]} top={
      <Card>
        <CardHeader><CardTitle>Study heatmap</CardTitle><span className="text-[12px] text-muted-foreground">Click a day to open it</span></CardHeader>
        <CardContent><Heatmap year={year} days={data.days} today={today} onSelect={onSelect} /></CardContent>
      </Card>
    } chartTitle="Month by month" chart={
      <StackedTimeBars data={data.months} xKey="month" keys={["focus"]} xFormat={(v) => formatDateKey(`${v}-01`, "MMM")} labelFormat={(v) => formatDateKey(`${v}-01`, "MMMM yyyy")} />
    } />
  );
}

function PeriodBody({ data, stats, chart, chartTitle, top }: {
  data: WeekAnalytics; stats: Array<{ label: string; value: string; sub?: string }>; chart: React.ReactNode; chartTitle: string; top?: React.ReactNode;
}) {
  const T = data.totals;
  const hours = trimHours(data.hourly);
  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <div className={`grid grid-cols-2 gap-x-6 gap-y-5 ${stats.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
          {stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} sub={s.sub} />)}
        </div>
      </Card>
      {top}
      <Card>
        <CardHeader><CardTitle>{chartTitle}</CardTitle><Legend /></CardHeader>
        <CardContent>{chart}</CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Subject distribution</CardTitle></CardHeader>
          <CardContent>{data.subjects.length ? <Donut items={data.subjects} centerLabel="studied" centerValue={formatDuration(T.focus)} /> : <Muted>No focus sessions in this period.</Muted>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Insights</CardTitle></CardHeader>
          <CardContent><Insights items={data.insights} /></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>When you study</CardTitle><span className="text-[12px] text-muted-foreground">All days combined, by hour</span></CardHeader>
        <CardContent><StackedTimeBars data={hours} xKey="hour" xFormat={hourLabel} height={180} /></CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Task completion</CardTitle></CardHeader>
          <CardContent><TaskCompletion {...data.tasks} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Productivity</CardTitle></CardHeader>
          <CardContent>
            <ProductivityExplainer focus={T.focus} session={T.session} score={data.productivity} />
            <p className="mt-4 border-t pt-3 text-[12px] text-muted-foreground">
              Breaks {formatDuration(T.break)} · Phone {formatDuration(T.phone)} · Untracked {formatDuration(T.idle + T.other)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ───────── helpers ───────── */

function Legend() {
  return (
    <div className="hidden items-center gap-3 text-[12px] text-muted-foreground sm:flex">
      {(["FOCUS", "BREAK", "PHONE"] as const).map((k) => (
        <span key={k} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: ACTIVITY_COLOR_VAR[k] }} />{k === "FOCUS" ? "Study" : k === "BREAK" ? "Break" : "Phone"}</span>
      ))}
    </div>
  );
}

function hourLabel(v: string | number) {
  const h = Number(v);
  return h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
}

/** Show only the span of hours that had activity (padded), so a library day isn't squashed into 24 columns. */
function trimHours<T extends { hour: number; focus: number; break: number; phone: number; other: number }>(hours: T[]) {
  const active = hours.filter((h) => h.focus + h.break + h.phone + h.other > 0);
  if (!active.length) return hours.slice(8, 20);
  const lo = Math.max(0, Math.min(...active.map((h) => h.hour)) - 1);
  const hi = Math.min(23, Math.max(...active.map((h) => h.hour)) + 1);
  return hours.slice(lo, Math.max(hi + 1, lo + 6));
}

function delta(cur: number, prev: number, label: string) {
  if (!prev) return cur ? (/^\d{4}$/.test(label) ? `none tracked in ${label}` : `none tracked ${label}`) : undefined;
  const p = Math.round(((cur - prev) / prev) * 100);
  return `${p >= 0 ? "+" : ""}${p}% vs ${label}`;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-muted-foreground">{children}</p>;
}

function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-56 rounded-xl" /><Skeleton className="h-56 rounded-xl" /></div>
    </div>
  );
}
