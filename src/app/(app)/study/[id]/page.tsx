"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive, ArchiveRestore, ArrowLeft, CalendarDays, ChevronDown, Clock, ExternalLink, FileText, Link2, ListTodo, MoreHorizontal, Pencil, Play, Plus, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { useTracker } from "@/components/tracker-provider";
import { useShellUser } from "@/components/shell/app-shell";
import { AreaIcon } from "@/components/area-icon";
import { AreaDialog } from "@/components/study/area-dialog";
import { EmptyState, ErrorNotice } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Checkbox, Progress, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/fetcher";
import { RESOURCE_LABEL, RESOURCE_TYPES } from "@/lib/constants";
import { encodePlan } from "@/lib/pomodoro";
import { planOf } from "@/components/tracker-provider";
import { formatDateKey, formatDuration } from "@/lib/time";
import type { GoalsOverview, StudyAreaDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

type Task = StudyAreaDetail["tasks"][number];
type Resource = StudyAreaDetail["resources"][number];

const PRIORITY: Record<string, { label: string; cls: string }> = {
  HIGH: { label: "High", cls: "text-[hsl(var(--state-phone))] bg-[hsl(var(--state-phone)/0.1)]" },
  MEDIUM: { label: "Medium", cls: "text-[hsl(var(--state-break))] bg-[hsl(var(--state-break)/0.12)]" },
  LOW: { label: "Low", cls: "text-muted-foreground bg-muted" },
};

export default function StudyAreaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTracker();
  const user = useShellUser();
  const key = `/api/study-areas/${id}`;
  const { data: area, error, mutate } = useSWR<StudyAreaDetail>(key);
  const { data: goals, mutate: mutateGoals } = useSWR<GoalsOverview>("/api/goals");
  const [editOpen, setEditOpen] = useState(false);
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task?: Task }>({ open: false });
  const [resDialog, setResDialog] = useState<{ open: boolean; resource?: Resource }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");

  if (error) return <ErrorNotice message={(error as Error).message || "Couldn't load this study area."} onRetry={() => mutate()} />;
  if (!area) return <DetailSkeleton />;

  const goal = goals?.goals.find((g) => g.type === "SUBJECT_WEEKLY" && g.studyAreaId === id);
  const done = area.tasks.filter((x) => x.status === "DONE").length;
  const pct = area.tasks.length ? Math.round((done / area.tasks.length) * 100) : 0;
  const shown = area.tasks.filter((x) => (filter === "all" ? true : filter === "done" ? x.status === "DONE" : x.status !== "DONE"));
  const studyingHere = t.state?.activity?.type === "FOCUS" && t.state.activity.studyArea?.id === id;

  const startStudy = async (taskId?: string) => {
    const plan = planOf(user);
    const ok = await t.startActivity({ type: "FOCUS", studyAreaId: id, taskId: taskId ?? null, mode: encodePlan(plan), plannedMinutes: plan.focus });
    if (ok) router.push("/timer");
  };

  const toggleArchive = async () => {
    try {
      await api(key, { method: "PATCH", body: { archived: !area.archivedAt } });
      toast.success(area.archivedAt ? "Restored" : "Archived — its time stays in your analytics");
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const remove = async () => {
    try {
      await api(key, { method: "DELETE" });
      toast.success("Study area deleted. Logged time is kept as “Deleted area”.");
      router.replace("/study");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <Link href="/study" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Study areas
      </Link>

      <header className="mb-7 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <AreaIcon icon={area.icon} color={area.color} size="lg" className="size-12" />
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-[26px] font-semibold leading-tight tracking-tight">
              {area.name}
              {area.archivedAt && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">Archived</span>}
            </h1>
            {area.description && <p className="mt-1 text-[14px] text-muted-foreground">{area.description}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {studyingHere ? (
            <Button asChild><Link href="/timer"><Clock /> Studying now</Link></Button>
          ) : (
            <Button onClick={() => startStudy()} disabled={t.busy || !!area.archivedAt}><Play /> Start studying</Button>
          )}
          <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>
          <AreaMenu archived={!!area.archivedAt} onArchive={toggleArchive} onDelete={() => setConfirmDelete(true)} />
        </div>
      </header>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-4">
        <Card className="p-3.5 sm:p-5">
          <p className="text-[12px] text-muted-foreground sm:text-[13px]">Total<span className="hidden sm:inline"> study time</span></p>
          <p className="tnum mt-1 text-[18px] font-semibold tracking-tight sm:text-[24px]">{formatDuration(area.totalSeconds)}</p>
        </Card>
        <Card className="p-3.5 sm:p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-[12px] text-muted-foreground sm:text-[13px]">Tasks</p>
            <p className="tnum text-[12px] text-muted-foreground sm:text-[13px]">{pct}%</p>
          </div>
          <p className="tnum mt-1 text-[18px] font-semibold tracking-tight sm:text-[24px]">{done}<span className="text-[13px] font-normal text-muted-foreground sm:text-[16px]"> / {area.tasks.length}<span className="hidden sm:inline"> done</span></span></p>
          <Progress value={pct} color={area.color} className="mt-2" />
        </Card>
        <Card className="p-3.5 sm:p-5">
          <p className="text-[12px] text-muted-foreground sm:text-[13px]">Weekly goal</p>
          {goal ? (
            <>
              <p className="tnum mt-1 text-[18px] font-semibold tracking-tight sm:text-[24px]">{formatDuration(goal.progressSec)}<span className="text-[13px] font-normal text-muted-foreground sm:text-[16px]"> / {formatDuration(goal.targetMinutes * 60)}</span></p>
              <Progress value={goal.percent} color={area.color} className="mt-2" />
            </>
          ) : (
            <button onClick={() => setEditOpen(true)} className="mt-2 text-[13px] font-medium text-primary hover:underline">Set goal</button>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
            <div className="flex items-center gap-1">
              <div className="mr-1 hidden rounded-lg bg-muted p-0.5 sm:flex">
                {(["open", "done", "all"] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={cn("rounded-md px-2.5 py-1 text-[12px] capitalize", filter === f ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>{f}</button>
                ))}
              </div>
              <Button size="sm" onClick={() => setTaskDialog({ open: true })}><Plus /> Task</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex rounded-lg bg-muted p-0.5 sm:hidden">
              {(["open", "done", "all"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={cn("flex-1 rounded-md py-1 text-[12px] capitalize", filter === f ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>{f}</button>
              ))}
            </div>
            {!area.tasks.length ? (
              <EmptyState icon={ListTodo} title="No tasks yet" body="Break this subject into concrete pieces — Two Pointer, Sliding Window, Binary Search…" action={<Button size="sm" onClick={() => setTaskDialog({ open: true })}><Plus /> Add a task</Button>} className="py-9" />
            ) : !shown.length ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">{filter === "open" ? "Everything here is done. 🎉" : "Nothing to show."}</p>
            ) : (
              shown.map((task) => (
                <TaskRow key={task.id} task={task} color={area.color} resources={area.resources.filter((r) => r.taskId === task.id)}
                  onChange={() => { mutate(); mutateGoals(); }}
                  onEdit={() => setTaskDialog({ open: true, task })}
                  onStart={() => startStudy(task.id)} />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>Resources</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setResDialog({ open: true })}><Plus /> Add</Button>
          </CardHeader>
          <CardContent>
            {!area.resources.length ? (
              <EmptyState icon={Link2} title="No resources" body="Courses, sheets, docs, notes — keep them next to the work." className="py-8" />
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {area.resources.map((r) => (
                  <ResourceRow key={r.id} r={r} taskName={area.tasks.find((x) => x.id === r.taskId)?.name} onEdit={() => setResDialog({ open: true, resource: r })} onChange={() => mutate()} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <AreaDialog open={editOpen} onOpenChange={setEditOpen}
        initial={{ id: area.id, name: area.name, description: area.description, icon: area.icon, color: area.color, weeklyGoalMinutes: goal?.targetMinutes ?? null }}
        onSaved={() => { mutate(); mutateGoals(); }} />
      <TaskDialog open={taskDialog.open} task={taskDialog.task} areaId={id} onOpenChange={(o) => setTaskDialog((s) => ({ ...s, open: o }))} onSaved={() => mutate()} />
      <ResourceDialog open={resDialog.open} resource={resDialog.resource} areaId={id} tasks={area.tasks} onOpenChange={(o) => setResDialog((s) => ({ ...s, open: o }))} onSaved={() => mutate()} />
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent title={`Delete ${area.name}?`} description="Its tasks, subtasks and resources are deleted. Time you already logged stays in your history and analytics. Archive instead if you might come back to it.">
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={remove}><Trash2 /> Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AreaMenu({ archived, onArchive, onDelete }: { archived: boolean; onArchive: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="ghost" size="icon" aria-label="More actions" aria-expanded={open} onClick={() => setOpen((o) => !o)}><MoreHorizontal /></Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-44 rounded-lg border bg-card p-1 shadow-lg">
            <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-muted" onClick={() => { setOpen(false); onArchive(); }}>
              {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} {archived ? "Restore" : "Archive"}
            </button>
            <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-destructive hover:bg-destructive/10" onClick={() => { setOpen(false); onDelete(); }}>
              <Trash2 className="size-4" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ───────── Tasks ───────── */

function TaskRow({ task, color, resources, onChange, onEdit, onStart }: { task: Task; color: string; resources: Resource[]; onChange: () => void; onEdit: () => void; onStart: () => void }) {
  const [open, setOpen] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [busy, setBusy] = useState(false);
  const isDone = task.status === "DONE";
  const subDone = task.subtasks.filter((s) => s.completed).length;
  const subPct = task.subtasks.length ? Math.round((subDone / task.subtasks.length) * 100) : 0;
  const overdue = task.dueDate && !isDone && task.dueDate < new Date().toISOString().slice(0, 10);

  const call = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); onChange(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const toggleDone = () => call(() => api(`/api/tasks/${task.id}`, { method: "PATCH", body: { status: isDone ? "TODO" : "DONE" } }));
  const addSub = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSub.trim();
    if (!name) return;
    setNewSub("");
    call(() => api("/api/subtasks", { body: { taskId: task.id, name } }));
  };

  return (
    <div className={cn("rounded-lg border transition-colors", open && "bg-muted/30")}>
      <div className="flex items-start gap-3 px-3 py-3">
        <Checkbox checked={isDone} onCheckedChange={toggleDone} disabled={busy} aria-label={isDone ? "Mark not done" : "Mark done"} className="mt-0.5" />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <p className={cn("text-[14px] font-medium leading-snug", isDone && "text-muted-foreground line-through")}>{task.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            <span className={cn("rounded px-1.5 py-px text-[11px] font-medium", PRIORITY[task.priority]?.cls)}>{PRIORITY[task.priority]?.label}</span>
            {task.status === "IN_PROGRESS" && <span className="text-primary">In progress</span>}
            {(task.estimatedMinutes || task.actualSeconds > 0) && (
              <span className="tnum flex items-center gap-1"><Clock className="size-3" />{formatDuration(task.actualSeconds)}{task.estimatedMinutes ? ` / ${formatDuration(task.estimatedMinutes * 60)} est.` : ""}</span>
            )}
            {task.dueDate && <span className={cn("flex items-center gap-1", overdue && "text-destructive")}><CalendarDays className="size-3" />{formatDateKey(task.dueDate, "MMM d")}</span>}
            {task.subtasks.length > 0 && <span className="tnum">{subDone} / {task.subtasks.length} · {subPct}%</span>}
            {resources.length > 0 && <span className="flex items-center gap-1"><Link2 className="size-3" />{resources.length}</span>}
          </div>
          {task.subtasks.length > 0 && <Progress value={subPct} color={color} className="mt-2 h-1" />}
        </button>
        <button onClick={() => setOpen((o) => !o)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Toggle details">
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <div className="space-y-4 border-t px-3 pb-3 pt-3 sm:pl-10">
              {task.description && <p className="whitespace-pre-wrap text-[13px] text-muted-foreground">{task.description}</p>}
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">Subtasks{task.subtasks.length ? ` · ${subDone} / ${task.subtasks.length} completed · ${subPct}%` : ""}</p>
                <ul className="space-y-0.5">
                  {task.subtasks.map((s) => (
                    <li key={s.id} className="group flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-muted">
                      <Checkbox checked={s.completed} onCheckedChange={(c) => call(() => api(`/api/subtasks/${s.id}`, { method: "PATCH", body: { completed: !!c } }))} disabled={busy} aria-label={s.name} />
                      <span className={cn("flex-1 text-[13px]", s.completed && "text-muted-foreground line-through")}>{s.name}</span>
                      <button onClick={() => call(() => api(`/api/subtasks/${s.id}`, { method: "DELETE" }))} className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100" aria-label={`Delete ${s.name}`}>
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                <form onSubmit={addSub} className="mt-1.5 flex gap-2">
                  <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Add a subtask…" className="h-8 text-[13px]" maxLength={200} />
                  <Button type="submit" size="sm" variant="outline" disabled={!newSub.trim() || busy}>Add</Button>
                </form>
              </div>
              {resources.length > 0 && (
                <div>
                  <p className="mb-1 text-[12px] font-medium text-muted-foreground">Resources</p>
                  {resources.map((r) => (
                    <a key={r.id} href={r.url ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 py-0.5 text-[13px] hover:underline">
                      <ExternalLink className="size-3" /> {r.title}
                    </a>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {!isDone && <Button size="sm" onClick={onStart}><Play /> Focus on this</Button>}
                <Button size="sm" variant="outline" onClick={onEdit}><Pencil /> Edit</Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => { if (confirm(`Delete “${task.name}”? Logged time stays in your history.`)) call(() => api(`/api/tasks/${task.id}`, { method: "DELETE" })); }}>
                  <Trash2 /> Delete
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TaskDialog({ open, task, areaId, onOpenChange, onSaved }: { open: boolean; task?: Task; areaId: string; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", description: "", status: "TODO", priority: "MEDIUM", estimate: "", due: "" });
  const [saving, setSaving] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setForm({
      name: task?.name ?? "", description: task?.description ?? "", status: task?.status ?? "TODO", priority: task?.priority ?? "MEDIUM",
      estimate: task?.estimatedMinutes ? String(task.estimatedMinutes) : "", due: task?.dueDate ?? "",
    });
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Task needs a name.");
    setSaving(true);
    const body = {
      name: form.name.trim(), description: form.description.trim() || null, status: form.status, priority: form.priority,
      estimatedMinutes: form.estimate ? Math.max(0, Math.round(Number(form.estimate))) : null, dueDate: form.due || null,
    };
    try {
      if (task) await api(`/api/tasks/${task.id}`, { method: "PATCH", body });
      else await api("/api/tasks", { body: { ...body, studyAreaId: areaId } });
      toast.success(task ? "Task updated" : "Task added");
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
      <DialogContent title={task ? "Edit task" : "New task"}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" htmlFor="t-name"><Input id="t-name" value={form.name} onChange={set("name")} placeholder="Two Pointer" autoFocus maxLength={200} /></Field>
          <Field label="Description" htmlFor="t-desc"><Textarea id="t-desc" value={form.description} onChange={set("description")} rows={2} placeholder="Optional" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status" htmlFor="t-status">
              <Select id="t-status" value={form.status} onChange={set("status")}>
                <option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="DONE">Done</option>
              </Select>
            </Field>
            <Field label="Priority" htmlFor="t-pri">
              <Select id="t-pri" value={form.priority} onChange={set("priority")}>
                <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
              </Select>
            </Field>
            <Field label="Estimate (min)" htmlFor="t-est"><Input id="t-est" type="number" min={0} value={form.estimate} onChange={set("estimate")} placeholder="90" /></Field>
            <Field label="Due date" htmlFor="t-due"><Input id="t-due" type="date" value={form.due} onChange={set("due")} /></Field>
          </div>
          {task && <p className="text-[12px] text-muted-foreground">Actual time so far: {formatDuration(task.actualSeconds)} — measured from your focus sessions.</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : task ? "Save" : "Add task"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── Resources ───────── */

function ResourceRow({ r, taskName, onEdit, onChange }: { r: Resource; taskName?: string; onEdit: () => void; onChange: () => void }) {
  const host = r.url ? (() => { try { return new URL(r.url).hostname.replace(/^www\./, ""); } catch { return r.url; } })() : null;
  const del = async () => {
    if (!confirm(`Remove “${r.title}”?`)) return;
    try { await api(`/api/resources/${r.id}`, { method: "DELETE" }); onChange(); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <li className="group flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/60">
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {r.type === "NOTES" || r.type === "BOOK" ? <FileText className="size-3.5" /> : <Link2 className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        {r.url ? (
          <a href={r.url} target="_blank" rel="noreferrer" className="block truncate text-[14px] font-medium hover:underline">{r.title}</a>
        ) : (
          <p className="truncate text-[14px] font-medium">{r.title}</p>
        )}
        <p className="truncate text-[12px] text-muted-foreground">
          {RESOURCE_LABEL[r.type as keyof typeof RESOURCE_LABEL]}{host ? ` · ${host}` : ""}{taskName ? ` · ${taskName}` : ""}
        </p>
        {r.description && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{r.description}</p>}
      </div>
      <div className="flex opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <button onClick={onEdit} className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground" aria-label={`Edit ${r.title}`}><Pencil className="size-3.5" /></button>
        <button onClick={del} className="rounded p-1 text-muted-foreground hover:bg-card hover:text-destructive" aria-label={`Delete ${r.title}`}><Trash2 className="size-3.5" /></button>
      </div>
    </li>
  );
}

function ResourceDialog({ open, resource, areaId, tasks, onOpenChange, onSaved }: { open: boolean; resource?: Resource; areaId: string; tasks: Task[]; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: "", url: "", type: "WEBSITE", description: "", taskId: "" });
  const [saving, setSaving] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setForm({ title: resource?.title ?? "", url: resource?.url ?? "", type: resource?.type ?? "WEBSITE", description: resource?.description ?? "", taskId: resource?.taskId ?? "" });
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Give the resource a title.");
    setSaving(true);
    const body = { title: form.title.trim(), url: form.url.trim() || null, type: form.type, description: form.description.trim() || null, taskId: form.taskId || null };
    try {
      if (resource) await api(`/api/resources/${resource.id}`, { method: "PATCH", body });
      else await api("/api/resources", { body: { ...body, studyAreaId: areaId } });
      toast.success(resource ? "Resource updated" : "Resource added");
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
      <DialogContent title={resource ? "Edit resource" : "Add resource"}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Title" htmlFor="r-title"><Input id="r-title" value={form.title} onChange={set("title")} placeholder="Striver A2Z DSA Sheet" autoFocus maxLength={200} /></Field>
          <Field label="URL" htmlFor="r-url"><Input id="r-url" value={form.url} onChange={set("url")} placeholder="https://…" inputMode="url" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="r-type">
              <Select id="r-type" value={form.type} onChange={set("type")}>
                {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{RESOURCE_LABEL[t]}</option>)}
              </Select>
            </Field>
            <Field label="Linked task" htmlFor="r-task">
              <Select id="r-task" value={form.taskId} onChange={set("taskId")}>
                <option value="">Whole subject</option>
                {tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Description" htmlFor="r-desc"><Textarea id="r-desc" value={form.description} onChange={set("description")} rows={2} placeholder="Optional" /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : resource ? "Save" : "Add resource"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-24" />
      <div className="flex items-center gap-4"><Skeleton className="size-12 rounded-xl" /><Skeleton className="h-8 w-48" /></div>
      <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]"><Skeleton className="h-80 rounded-xl" /><Skeleton className="h-60 rounded-xl" /></div>
    </div>
  );
}
