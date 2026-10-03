"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { CalendarDays, ChevronRight, Download, LogOut, Monitor, Moon, Sun, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/shell/app-shell";
import { ErrorNotice, PageHeader } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/fetcher";
import type { PublicUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { PLAN_LIMITS, PRESETS, samePlan, sanitizePlan } from "@/lib/pomodoro";
import { AlarmSettings } from "@/components/settings/alarm-settings";

type SettingsResp = { user: PublicUser; settings: { dailyGoalMinutes: number | null } };

export default function SettingsPage() {
  const { data, error, mutate } = useSWR<SettingsResp>("/api/settings");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" description="Your profile, defaults and data." />
      <nav className="mb-6 grid grid-cols-2 gap-2 lg:hidden" aria-label="More">
        <QuickLink href="/goals" icon={Target} label="Goals" />
        <QuickLink href="/calendar" icon={CalendarDays} label="Calendar" />
      </nav>
      {error && <ErrorNotice onRetry={() => mutate()} />}
      {!data ? (
        <div className="space-y-4"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-56 rounded-xl" /></div>
      ) : (
        <div className="space-y-4">
          <ProfileSection data={data} onSaved={(d) => mutate(d, false)} />
          <PomodoroSection data={data} onSaved={(d) => mutate(d, false)} />
          <Section id="sound" title="Sound & alerts" description="How FocusLog tells you a focus session or break is over — so you don't have to keep checking.">
            <AlarmSettings />
          </Section>
          <PreferencesSection data={data} onSaved={(d) => mutate(d, false)} />
          <AppearanceSection />
          <DataSection hasPassword={data.user.hasPassword} />
        </div>
      )}
    </div>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: typeof Target; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-xl border bg-card px-4 py-3 text-[14px] font-medium">
      <Icon className="size-4 text-muted-foreground" /> {label} <ChevronRight className="ml-auto size-4 text-muted-foreground" />
    </Link>
  );
}

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20 p-5 sm:p-6">
      <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function ProfileSection({ data, onSaved }: { data: SettingsResp; onSaved: (d: SettingsResp) => void }) {
  const router = useRouter();
  const [name, setName] = useState(data.user.name);
  const [avatarUrl, setAvatarUrl] = useState(data.user.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = name !== data.user.name || avatarUrl !== (data.user.avatarUrl ?? "");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const d = await api<SettingsResp>("/api/settings", { method: "PATCH", body: { name: name.trim(), avatarUrl: avatarUrl.trim() } });
      onSaved(d);
      router.refresh();
      toast.success("Profile saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section id="profile" title="Profile">
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar user={{ name: name || data.user.name, avatarUrl: avatarUrl || null }} className="size-14 text-[18px]" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium">{name || data.user.name}</p>
            <p className="truncate text-[13px] text-muted-foreground">{data.user.email}</p>
          </div>
        </div>
        <Field label="Name" htmlFor="s-name"><Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
        <Field label="Email" htmlFor="s-email" hint={data.user.hasGoogle ? "Signed in with Google too." : "Email changes need verification, which arrives with email delivery."}>
          <Input id="s-email" value={data.user.email} disabled />
        </Field>
        <Field label="Avatar URL" htmlFor="s-avatar" hint="Link to an image. Leave empty to use your initials.">
          <Input id="s-avatar" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" inputMode="url" />
        </Field>
        <div className="flex justify-end"><Button type="submit" disabled={!dirty || saving || !name.trim()}>{saving ? "Saving…" : "Save profile"}</Button></div>
      </form>
    </Section>
  );
}

function PreferencesSection({ data, onSaved }: { data: SettingsResp; onSaved: (d: SettingsResp) => void }) {
  const router = useRouter();
  const [goal, setGoal] = useState(data.settings.dailyGoalMinutes ? String(+(data.settings.dailyGoalMinutes / 60).toFixed(2)) : "");
  const [tz, setTz] = useState(data.user.timezone);
  const [saving, setSaving] = useState(false);
  const zones = useMemo(() => {
    try {
      const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
      return all.includes(data.user.timezone) ? all : [data.user.timezone, ...all];
    } catch {
      return [data.user.timezone];
    }
  }, [data.user.timezone]);
  const deviceTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const g = goal ? Number(goal) : null;
    if (g !== null && !(g >= 0.25 && g <= 24)) return toast.error("Daily goal must be between 15 minutes and 24 hours.");
    setSaving(true);
    try {
      const d = await api<SettingsResp>("/api/settings", {
        method: "PATCH",
        body: { timezone: tz, ...(g ? { dailyGoalMinutes: Math.round(g * 60) } : {}) },
      });
      onSaved(d);
      router.refresh();
      toast.success("Preferences saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Preferences" description="Your daily goal and the time zone days are counted in.">
      <form onSubmit={save} className="space-y-4">
        <div className="max-w-[220px]">
          <Field label="Daily study goal" htmlFor="p-goal"><Suffix unit="hours"><Input id="p-goal" type="number" min={0.25} max={24} step={0.25} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="6" /></Suffix></Field>
        </div>
        <Field label="Time zone" htmlFor="p-tz" hint="Days, hours and streaks are counted in this time zone.">
          <div className="flex gap-2">
            <Select id="p-tz" value={tz} onChange={(e) => setTz(e.target.value)}>
              {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
            </Select>
            {deviceTz && deviceTz !== tz && <Button type="button" variant="outline" onClick={() => setTz(deviceTz)} className="shrink-0">Use device</Button>}
          </div>
        </Field>
        <div className="flex justify-end"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save preferences"}</Button></div>
      </form>
    </Section>
  );
}

function PomodoroSection({ data, onSaved }: { data: SettingsResp; onSaved: (d: SettingsResp) => void }) {
  const router = useRouter();
  const u = data.user;
  const initial = { focus: u.defaultFocusMinutes, short: u.defaultBreakMinutes, long: u.longBreakMinutes, every: u.longBreakEvery };
  const [f, setF] = useState({ focus: String(initial.focus), short: String(initial.short), long: String(initial.long), every: String(initial.every) });
  const [autoBreaks, setAutoBreaks] = useState(u.autoStartBreaks);
  const [autoFocus, setAutoFocus] = useState(u.autoStartFocus);
  const [saving, setSaving] = useState(false);
  const plan = sanitizePlan({ focus: +f.focus, short: +f.short, long: +f.long, every: +f.every }, initial);
  const dirty = !samePlan(plan, initial) || autoBreaks !== u.autoStartBreaks || autoFocus !== u.autoStartFocus;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const d = await api<SettingsResp>("/api/settings", {
        method: "PATCH",
        body: { defaultFocusMinutes: plan.focus, defaultBreakMinutes: plan.short, longBreakMinutes: plan.long, longBreakEvery: plan.every, autoStartBreaks: autoBreaks, autoStartFocus: autoFocus },
      });
      onSaved(d);
      setF({ focus: String(plan.focus), short: String(plan.short), long: String(plan.long), every: String(plan.every) });
      router.refresh();
      toast.success("Pomodoro saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Pomodoro" description="Focus, short break, repeat — and a long break after a set number of focus sessions. Every timer counts down.">
      <form onSubmit={save} className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => setF({ focus: String(p.plan.focus), short: String(p.plan.short), long: String(p.plan.long), every: String(p.plan.every) })}
              className={cn("tnum h-8 rounded-lg border px-3 text-[13px]", samePlan(p.plan, plan) ? "border-primary bg-accent font-medium" : "hover:bg-muted")}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Focus" htmlFor="pm-focus"><Suffix unit="min"><Input id="pm-focus" type="number" min={PLAN_LIMITS.focus.min} max={PLAN_LIMITS.focus.max} value={f.focus} onChange={set("focus")} /></Suffix></Field>
          <Field label="Short break" htmlFor="pm-short"><Suffix unit="min"><Input id="pm-short" type="number" min={PLAN_LIMITS.short.min} max={PLAN_LIMITS.short.max} value={f.short} onChange={set("short")} /></Suffix></Field>
          <Field label="Long break" htmlFor="pm-long"><Suffix unit="min"><Input id="pm-long" type="number" min={PLAN_LIMITS.long.min} max={PLAN_LIMITS.long.max} value={f.long} onChange={set("long")} /></Suffix></Field>
          <Field label="Long break after" htmlFor="pm-every"><Suffix unit="focus"><Input id="pm-every" type="number" min={PLAN_LIMITS.every.min} max={PLAN_LIMITS.every.max} value={f.every} onChange={set("every")} /></Suffix></Field>
        </div>
        <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-[13px] text-muted-foreground">
          {Array.from({ length: plan.every }).map((_, i) => `${plan.focus}′ focus → ${i === plan.every - 1 ? `${plan.long}′ long break` : `${plan.short}′ break`}`).join(" → ")}
        </p>
        <div className="space-y-3">
          <Toggle checked={autoBreaks} onChange={setAutoBreaks} label="Auto-start breaks" hint="When a focus session ends, the break starts by itself." />
          <Toggle checked={autoFocus} onChange={setAutoFocus} label="Auto-start next focus" hint="When a break ends, the next focus session starts by itself (only while FocusLog is open)." />
        </div>
        <div className="flex justify-end"><Button type="submit" disabled={!dirty || saving}>{saving ? "Saving…" : "Save pomodoro"}</Button></div>
      </form>
    </Section>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-[14px] font-medium">{label}</span>
        <span className="block text-[12px] text-muted-foreground">{hint}</span>
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-muted-foreground/25")}>
        <span className={cn("absolute left-0 top-0.5 size-5 rounded-full bg-card shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
    </label>
  );
}

function Suffix({ unit, children }: { unit: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">{unit}</span>
    </div>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const opts = [
    { v: "light", l: "Light", I: Sun },
    { v: "dark", l: "Dark", I: Moon },
    { v: "system", l: "System", I: Monitor },
  ];
  return (
    <Section title="Appearance">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
        {opts.map(({ v, l, I }) => (
          <button key={v} role="radio" aria-checked={mounted && theme === v} onClick={() => setTheme(v)}
            className={cn("flex flex-col items-center gap-2 rounded-xl border py-4 text-[13px] transition-colors", mounted && theme === v ? "border-primary bg-accent font-medium" : "hover:bg-muted")}>
            <I className="size-5" /> {l}
          </button>
        ))}
      </div>
    </Section>
  );
}

function DataSection({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    await api("/api/auth/logout", { body: {} }).catch(() => null);
    router.replace("/login");
    router.refresh();
  };
  const del = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/account", { method: "DELETE", body: { confirm, password: password || undefined } });
      toast.success("Your account and all data were deleted.");
      router.replace("/register");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Section title="Account & data" description="Your productivity data belongs to you.">
      <div className="divide-y">
        <Row title="Export data" body="Every activity session as CSV — date, subject, task, start, end, duration, type.">
          <Button variant="outline" asChild><a href="/api/export" download><Download /> Export CSV</a></Button>
        </Row>
        <Row title="Log out" body="End this session on this device.">
          <Button variant="outline" onClick={logout}><LogOut /> Log out</Button>
        </Row>
        <Row title="Delete account" body="Permanently removes your account and all sessions, tasks, goals and reflections.">
          <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setOpen(true)}><Trash2 /> Delete</Button>
        </Row>
      </div>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPassword(""); setConfirm(""); } }}>
        <DialogContent title="Delete your account?" description="This can't be undone. Export your data first if you want to keep it.">
          <form onSubmit={del} className="space-y-4">
            {hasPassword && <Field label="Password" htmlFor="d-pw"><Input id="d-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>}
            <Field label="Type DELETE to confirm" htmlFor="d-confirm"><Input id="d-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={busy || confirm !== "DELETE" || (hasPassword && !password)}>{busy ? "Deleting…" : "Delete everything"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function Row({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-[14px] font-medium">{title}</p><p className="text-[13px] text-muted-foreground">{body}</p></div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
