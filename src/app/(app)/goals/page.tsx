"use client";
import { useState } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import { Flame, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useStudyAreas } from "@/components/tracking/widgets";
import { EmptyState, ErrorNotice, PageHeader, Stat } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Progress, Skeleton, Tooltip } from "@/components/ui/misc";
import { api } from "@/lib/fetcher";
import { formatDateKey, formatDuration } from "@/lib/time";
import type { GoalsOverview } from "@/lib/types";
import { cn } from "@/lib/utils";

type Goal = GoalsOverview["goals"][number];
type GoalType = Goal["type"];
const TYPE_LABEL: Record<GoalType, string> = { DAILY: "Daily goal", WEEKLY: "Weekly goal", SUBJECT_WEEKLY: "Subject goal" };

export default function GoalsPage() {
  const { data, error, mutate } = useSWR<GoalsOverview>("/api/goals");
  const [dialog, setDialog] = useState<{ open: boolean; goal?: Goal }>({ open: false });

  if (error) return <ErrorNotice onRetry={() => mutate()} />;
  const goals = data?.goals ?? [];
  const sorted = [...goals].sort((a, b) => order(a.type) - order(b.type));

  return (
    <div>
      <PageHeader
        title="Goals"
        description="Targets for study time. Progress comes only from real focus sessions."
        actions={<Button onClick={() => setDialog({ open: true })}><Plus /> New goal</Button>}
      />

      {!data ? (
        <div className="space-y-4"><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-48 rounded-xl" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            {!sorted.length ? (
              <EmptyState icon={Target} title="No goals yet" body="Set a daily or weekly target and FocusLog will track your progress against it." action={<Button onClick={() => setDialog({ open: true })}><Plus /> Create a goal</Button>} />
            ) : (
              sorted.map((g, i) => (
                <motion.div key={g.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <GoalCard goal={g} onEdit={() => setDialog({ open: true, goal: g })} onDelete={async () => {
                    if (!confirm("Remove this goal? Past days keep the target they had.")) return;
                    try { await api(`/api/goals/${g.id}`, { method: "DELETE" }); mutate(); toast.success("Goal removed"); } catch (e) { toast.error((e as Error).message); }
                  }} />
                </motion.div>
              ))
            )}
          </div>
          <StreakCard data={data} />
        </div>
      )}
      <GoalDialog open={dialog.open} goal={dialog.goal} existing={goals} onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))} onSaved={() => mutate()} />
    </div>
  );
}

function order(t: GoalType) {
  return t === "DAILY" ? 0 : t === "WEEKLY" ? 1 : 2;
}

function GoalCard({ goal, onEdit, onDelete }: { goal: Goal; onEdit: () => void; onDelete: () => void }) {
  const target = goal.targetMinutes * 60;
  const done = goal.progressSec >= target;
  const left = Math.max(0, target - goal.progressSec);
  const title = goal.type === "DAILY" ? `Study ${formatDuration(target)} today` : goal.type === "WEEKLY" ? `Study ${formatDuration(target)} this week` : `${goal.areaName ?? "Subject"} · ${formatDuration(target)} / week`;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            {goal.type === "SUBJECT_WEEKLY" && <span className="size-2 rounded-full" style={{ background: goal.areaColor ?? undefined }} />}
            {TYPE_LABEL[goal.type]}
          </p>
          <p className="mt-0.5 truncate text-[16px] font-semibold tracking-tight">{title}</p>
        </div>
        <div className="flex shrink-0">
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit goal"><Pencil /></Button>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Remove goal" className="hover:text-destructive"><Trash2 /></Button>
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <p className="tnum text-[22px] font-semibold tracking-tight">
          {formatDuration(goal.progressSec)} <span className="text-[15px] font-normal text-muted-foreground">/ {formatDuration(target)}</span>
        </p>
        <p className={cn("tnum text-[14px] font-medium", done ? "text-primary" : "text-muted-foreground")}>{goal.percent}%</p>
      </div>
      <Progress value={goal.percent} className="mt-2 h-2" color={goal.type === "SUBJECT_WEEKLY" ? (goal.areaColor ?? undefined) : undefined} />
      <p className="mt-2 text-[12px] text-muted-foreground">{done ? "Reached. Anything more is a bonus." : `${formatDuration(left)} to go`}</p>
    </Card>
  );
}

function StreakCard({ data }: { data: GoalsOverview }) {
  const s = data.streak;
  return (
    <Card className="self-start">
      <CardHeader><CardTitle>Consistency</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <span className={cn("inline-flex size-11 items-center justify-center rounded-xl", s.current ? "bg-[hsl(var(--state-break)/0.14)] text-[hsl(var(--state-break))]" : "bg-muted text-muted-foreground")}>
            <Flame className="size-5" />
          </span>
          <div>
            <p className="text-[20px] font-semibold tracking-tight">{s.current} day streak</p>
            <p className="text-[12px] text-muted-foreground">{s.todayMet ? "Today's goal is met." : "Meet today's goal to extend it."}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-4 border-t pt-4">
          <Stat label="Longest" value={`${s.longest}`} />
          <Stat label="Days studied" value={`${s.daysStudied}`} />
          <Stat label="Days missed" value={`${s.daysMissed}`} />
        </div>
        <div className="mt-5">
          <p className="mb-2 text-[12px] text-muted-foreground">Last 4 weeks</p>
          <div className="grid grid-cols-7 gap-1.5">
            {data.lastDays.map((d) => (
              <Tooltip key={d.date} content={<span>{formatDateKey(d.date, "EEE, MMM d")} · {formatDuration(d.focus)}{d.target ? ` of ${formatDuration(d.target)}` : ""}</span>}>
                <span
                  className={cn("aspect-square rounded-md", d.date === data.today && "ring-1 ring-foreground/30 ring-offset-1 ring-offset-card")}
                  style={{ background: d.met ? "hsl(var(--state-focus))" : d.focus > 0 ? "hsl(var(--state-focus) / 0.3)" : "hsl(var(--muted))" }}
                  aria-label={`${d.date}: ${d.met ? "goal met" : "goal not met"}`}
                />
              </Tooltip>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            A day counts when you reach the daily goal that was in effect that day. Streaks are a nudge — your study time is the real measure.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function GoalDialog({ open, goal, existing, onOpenChange, onSaved }: { open: boolean; goal?: Goal; existing: Goal[]; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const { data: areas } = useStudyAreas();
  const [type, setType] = useState<GoalType>("DAILY");
  const [areaId, setAreaId] = useState("");
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setType(goal?.type ?? "DAILY");
      setAreaId(goal?.studyAreaId ?? "");
      setHours(goal ? String(+(goal.targetMinutes / 60).toFixed(2)) : "");
    }
  }
  const replaces = !goal && existing.find((g) => g.type === type && (type !== "SUBJECT_WEEKLY" || g.studyAreaId === areaId));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) return toast.error("Enter a target in hours.");
    if (type === "SUBJECT_WEEKLY" && !areaId) return toast.error("Choose a study area.");
    const max = type === "DAILY" ? 24 : 168;
    if (h > max) return toast.error(`That's more than ${max} hours.`);
    setSaving(true);
    try {
      await api("/api/goals", { body: { type, studyAreaId: type === "SUBJECT_WEEKLY" ? areaId : null, targetMinutes: Math.max(5, Math.round(h * 60)) } });
      toast.success("Goal saved");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={goal ? "Edit goal" : "New goal"} description="Changing a target applies from today; past days keep the target they had.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Type" htmlFor="g-type">
            <Select id="g-type" value={type} onChange={(e) => setType(e.target.value as GoalType)} disabled={!!goal}>
              <option value="DAILY">Daily — study X hours each day</option>
              <option value="WEEKLY">Weekly — study X hours each week</option>
              <option value="SUBJECT_WEEKLY">Subject — X hours of one area per week</option>
            </Select>
          </Field>
          {type === "SUBJECT_WEEKLY" && (
            <Field label="Study area" htmlFor="g-area">
              <Select id="g-area" value={areaId} onChange={(e) => setAreaId(e.target.value)} disabled={!!goal}>
                <option value="">Choose…</option>
                {(areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Target" htmlFor="g-hours" hint={replaces ? "This replaces your current goal of the same kind." : undefined}>
            <div className="flex items-center gap-2">
              <Input id="g-hours" type="number" min={0.25} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} placeholder={type === "DAILY" ? "6" : type === "WEEKLY" ? "30" : "10"} className="w-28" autoFocus />
              <span className="text-[13px] text-muted-foreground">hours {type === "DAILY" ? "per day" : "per week"}</span>
            </div>
          </Field>
          {type === "DAILY" && <div className="flex flex-wrap gap-1.5">{[2, 4, 6, 8].map((h) => <QuickChip key={h} onClick={() => setHours(String(h))} active={hours === String(h)}>{h}h</QuickChip>)}</div>}
          {type === "WEEKLY" && <div className="flex flex-wrap gap-1.5">{[20, 30, 40].map((h) => <QuickChip key={h} onClick={() => setHours(String(h))} active={hours === String(h)}>{h}h</QuickChip>)}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save goal"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickChip({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("h-8 rounded-lg border px-3 text-[13px]", active ? "border-primary bg-accent font-medium" : "hover:bg-muted")}>
      {children}
    </button>
  );
}
