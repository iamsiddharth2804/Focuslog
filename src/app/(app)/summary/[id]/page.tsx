"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { useShellUser } from "@/components/shell/app-shell";
import { useTracker } from "@/components/tracker-provider";
import { DayStrip, Timeline } from "@/components/tracking/day-views";
import { SubjectBars } from "@/components/dashboard/subject-bars";
import { ProductivityExplainer } from "@/components/dashboard/productivity";
import { ErrorNotice, Stat } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Progress, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/fetcher";
import { ACTIVITY_COLOR_VAR } from "@/lib/constants";
import { formatDateKey, formatDuration, formatTimeInTz } from "@/lib/time";
import type { DayAnalytics } from "@/lib/types";
import { cn } from "@/lib/utils";

type SessionResp = {
  session: { id: string; date: string; label: string | null; startedAt: string; endedAt: string | null; status: string };
  reflection: { rating: number; note: string | null } | null;
};

const RATINGS = [
  { v: 1, e: "😞", l: "Rough" },
  { v: 2, e: "😐", l: "Meh" },
  { v: 3, e: "🙂", l: "Okay" },
  { v: 4, e: "😄", l: "Good" },
  { v: 5, e: "🔥", l: "Great" },
];

export default function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useShellUser();
  const t = useTracker();
  const { data: s, error: sErr, mutate: refetchSession } = useSWR<SessionResp>(`/api/daily-sessions/${id}`);
  const { data: day, error: dErr } = useSWR<DayAnalytics>(`/api/analytics/day?session=${id}`);

  if (sErr || dErr) return <ErrorNotice message="Couldn't load this summary." />;
  if (!s || !day) return <SummarySkeleton />;

  const first = user.name.split(" ")[0];
  const { totals } = day;
  const headline = totals.focus >= 4 * 3600 ? `Great work today, ${first}.` : totals.focus > 0 ? `Here's your day, ${first}.` : `Session ended, ${first}.`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mx-auto max-w-3xl">
      <header className="mb-7">
        <h1 className="text-[28px] font-semibold tracking-tight">{headline}</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">
          {formatDateKey(s.session.date)}
          {s.session.label ? ` · ${s.session.label}` : ""} · {formatTimeInTz(s.session.startedAt, user.timezone)}
          {s.session.endedAt ? ` – ${formatTimeInTz(s.session.endedAt, user.timezone)}` : ""}
        </p>
      </header>

      <Card className="p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Stat label="Total session" value={formatDuration(totals.session, { seconds: true })} />
          <Stat label="Focused study" value={formatDuration(totals.focus, { seconds: true })} color={ACTIVITY_COLOR_VAR.FOCUS} />
          <Stat label="Breaks" value={formatDuration(totals.break, { seconds: true })} color={ACTIVITY_COLOR_VAR.BREAK} />
          <Stat label="Phone" value={formatDuration(totals.phone, { seconds: true })} color={ACTIVITY_COLOR_VAR.PHONE} />
        </div>
        {day.timeline.length > 0 && <DayStrip entries={day.timeline} now={t.now} tz={user.timezone} className="mt-6" />}
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Subject breakdown</CardTitle></CardHeader>
          <CardContent>
            {day.subjects.length ? <SubjectBars subjects={day.subjects} /> : <p className="text-[13px] text-muted-foreground">No focus time logged in this session.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tasks completed</CardTitle></CardHeader>
          <CardContent>
            <p className="tnum text-[30px] font-semibold tracking-tight">
              {day.tasks.completed} <span className="text-[18px] font-normal text-muted-foreground">/ {day.tasks.planned}</span>
            </p>
            <Progress value={day.tasks.rate ?? 0} className="mt-3" />
            <p className="mt-2 text-[12px] text-muted-foreground">
              {day.tasks.rate !== null ? `${day.tasks.rate}% of the tasks you worked on or had due` : "No tasks were worked on or due in this session."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Productivity</CardTitle></CardHeader>
        <CardContent><ProductivityExplainer focus={totals.focus} session={totals.session} score={day.productivity} /></CardContent>
      </Card>

      <Reflection sessionId={id} initial={s.reflection} onSaved={() => refetchSession()} />

      {day.timeline.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle>How the day went</CardTitle></CardHeader>
          <CardContent><Timeline entries={day.timeline} tz={user.timezone} /></CardContent>
        </Card>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" asChild><Link href="/dashboard">Dashboard</Link></Button>
        <Button asChild><Link href="/analytics">See analytics <ArrowRight /></Link></Button>
      </div>
    </motion.div>
  );
}

function Reflection({ sessionId, initial, onSaved }: { sessionId: string; initial: SessionResp["reflection"]; onSaved: () => void }) {
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!initial);
  useEffect(() => setSaved(false), [rating, note]);
  useEffect(() => setSaved(!!initial), [initial]);

  const save = async () => {
    if (!rating) return toast.error("Pick how the day felt first.");
    setSaving(true);
    try {
      await api("/api/reflections", { body: { dailySessionId: sessionId, rating, note: note.trim() || null } });
      setSaved(true);
      toast.success("Reflection saved");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-4 p-5 sm:p-6">
      <p className="text-[15px] font-semibold">How productive did you feel?</p>
      <div className="mt-4 grid grid-cols-5 gap-2" role="radiogroup" aria-label="Productivity rating">
        {RATINGS.map((r) => (
          <button
            key={r.v}
            role="radio"
            aria-checked={rating === r.v}
            aria-label={r.l}
            onClick={() => setRating(r.v)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border py-3 transition-colors",
              rating === r.v ? "border-primary bg-accent" : "hover:bg-muted",
            )}
          >
            <span className={cn("text-[26px] leading-none transition-transform", rating === r.v && "scale-110")}>{r.e}</span>
            <span className="text-[11px] text-muted-foreground">{r.l}</span>
          </button>
        ))}
      </div>
      <label htmlFor="reflection" className="mt-5 block text-[14px] font-medium">What did you accomplish today?</label>
      <Textarea id="reflection" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write a short reflection…" rows={4} className="mt-2" maxLength={4000} />
      <div className="mt-4 flex items-center justify-end gap-3">
        {saved && <span className="flex items-center gap-1 text-[13px] text-muted-foreground"><Check className="size-4" /> Saved</span>}
        <Button onClick={save} disabled={saving || !rating}>{saving ? "Saving…" : "Save reflection"}</Button>
      </div>
    </Card>
  );
}

function SummarySkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-36 rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-44 rounded-xl" /><Skeleton className="h-44 rounded-xl" /></div>
      <Skeleton className="h-60 rounded-xl" />
    </div>
  );
}
