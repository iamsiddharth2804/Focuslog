"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { LogOut, Pause, Play } from "lucide-react";
import { Logo } from "./logo";
import { MOBILE_NAV, PRIMARY_NAV, SECONDARY_NAV } from "./nav";
import { TrackerProvider, useTracker } from "@/components/tracker-provider";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StateDot } from "@/components/tracking/state-dot";
import { api } from "@/lib/fetcher";
import { cn, initials } from "@/lib/utils";
import { ACTIVITY_LABEL } from "@/lib/constants";
import { formatClock, formatDuration } from "@/lib/time";
import type { PublicUser } from "@/lib/auth/session";
import { Clock } from "@/components/tracking/clock";
import { CycleDots } from "@/components/tracking/cycle";
import { breakKindOf, encodePlan } from "@/lib/pomodoro";

export type ShellUser = Pick<PublicUser, "id" | "name" | "email" | "avatarUrl" | "timezone" | "defaultFocusMinutes" | "defaultBreakMinutes" | "longBreakMinutes" | "longBreakEvery" | "autoStartBreaks" | "autoStartFocus">;

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  return (
    <UserContext.Provider value={user}>
    <TrackerProvider>
      <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
        <Sidebar user={user} />
        <main className="min-w-0 pb-[calc(8.5rem+env(safe-area-inset-bottom))] lg:pb-12">
          <div className="mx-auto w-full max-w-[1120px] px-4 pt-5 sm:px-6 lg:px-10 lg:pt-10">{children}</div>
        </main>
        <MobileNowBar />
        <MobileNav />
        <CompletionDialog user={user} />
      </div>
    </TrackerProvider>
    </UserContext.Provider>
  );
}

/* Exposes the signed-in user to client pages without prop drilling. */
const UserContext = createContext<ShellUser | null>(null);
export function useShellUser() {
  const u = useContext(UserContext);
  if (!u) throw new Error("useShellUser must be used inside AppShell");
  return u;
}

function isActive(pathname: string, href: string) {
  const base = href.split("#")[0]!;
  if (href.includes("#")) return false;
  return pathname === base || pathname.startsWith(base + "/");
}

function Sidebar({ user }: { user: ShellUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = async () => {
    await api("/api/auth/logout", { body: {} }).catch(() => null);
    router.replace("/login");
    router.refresh();
  };
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card/40 px-3 py-5 lg:flex">
      <Link href="/dashboard" className="mb-7 px-3">
        <Logo />
      </Link>
      <nav className="space-y-0.5" aria-label="Main">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}
      </nav>
      <div className="my-4 border-t" />
      <nav className="space-y-0.5" aria-label="Account">
        {SECONDARY_NAV.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}
      </nav>
      <div className="mt-auto space-y-3">
        <SidebarNow />
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <Avatar user={user} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="truncate text-[12px] text-muted-foreground">{user.email}</p>
          </div>
          <button onClick={logout} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Log out">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted font-medium text-foreground",
      )}
    >
      <Icon className="size-[18px]" />
      {label}
    </Link>
  );
}

export function Avatar({ user, className }: { user: Pick<ShellUser, "name" | "avatarUrl">; className?: string }) {
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatarUrl} alt="" className={cn("size-8 rounded-full object-cover", className)} />;
  }
  return (
    <span className={cn("inline-flex size-8 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-accent-foreground", className)}>
      {initials(user.name)}
    </span>
  );
}

function useNowLabel() {
  const { state, activitySeconds, remainingSeconds } = useTracker();
  const a = state?.activity;
  if (!a) return null;
  const kind = breakKindOf(a.mode);
  const title = a.type === "FOCUS" ? (a.studyArea?.name ?? "Study") : kind === "long" ? "Long break" : kind === "short" ? "Short break" : ACTIVITY_LABEL[a.type];
  const sub = a.type === "FOCUS" ? (a.task?.name ?? "Focus") : a.type === "PHONE" ? "Counting time away" : a.label;
  const time = remainingSeconds !== null ? formatClock(remainingSeconds, true) : formatClock(activitySeconds, true);
  return { a, title, sub, time };
}

function SidebarNow() {
  const t = useTracker();
  const now = useNowLabel();
  if (!now) return null;
  return (
    <div className="rounded-xl border bg-card p-3">
      <Link href="/timer" className="flex items-center gap-2">
        <StateDot type={now.a.type} pulsing={!now.a.paused} />
        <span className="truncate text-[13px] font-medium">{now.title}</span>
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <span className="tnum text-xl font-semibold tracking-tight"><Clock value={now.time} /></span>
        <Button size="icon" variant="outline" className="size-8" onClick={() => (now.a.paused ? t.resumeActivity() : t.pauseActivity())} aria-label={now.a.paused ? "Resume" : "Pause"}>
          {now.a.paused ? <Play /> : <Pause />}
        </Button>
      </div>
    </div>
  );
}

/** Always-reachable timer on mobile — one tap to pause/resume. */
function MobileNowBar() {
  const pathname = usePathname();
  const t = useTracker();
  const now = useNowLabel();
  if (!now || pathname.startsWith("/timer")) return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 lg:hidden">
      <div className="flex items-center gap-3 rounded-2xl border bg-card/95 px-3 py-2.5 shadow-lg backdrop-blur">
        <Link href="/timer" className="flex min-w-0 flex-1 items-center gap-2.5">
          <StateDot type={now.a.type} pulsing={!now.a.paused} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium leading-tight">{now.title}</p>
            {now.sub && <p className="truncate text-[12px] text-muted-foreground">{now.sub}</p>}
          </div>
        </Link>
        <span className="tnum text-[15px] font-semibold"><Clock value={now.time} /></span>
        <Button size="icon" className="size-9 rounded-full" onClick={() => (now.a.paused ? t.resumeActivity() : t.pauseActivity())} aria-label={now.a.paused ? "Resume" : "Pause"}>
          {now.a.paused ? <Play /> : <Pause />}
        </Button>
      </div>
    </div>
  );
}

function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur lg:hidden" aria-label="Main">
      <div className="mx-auto grid h-16 max-w-md grid-cols-5">
        {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href) || (href === "/settings" && (pathname.startsWith("/goals") || pathname.startsWith("/calendar")));
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground", active && "text-foreground")}>
              <Icon className={cn("size-5", active && "text-primary")} strokeWidth={active ? 2.25 : 1.75} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ───────── Pomodoro completion ───────── */

const ACK_KEY = "fl_acked_completions";
function readAcked(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ACK_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function CompletionDialog({ user }: { user: ShellUser }) {
  const t = useTracker();
  const [acked, setAcked] = useState<string[]>([]);
  useEffect(() => setAcked(readAcked()), []);

  const last = t.state?.lastEnded;
  const recent = last?.endedAt ? t.now - new Date(last.endedAt).getTime() < 60 * 60 * 1000 : false;
  const open = !!last && last.endReason === "COMPLETED" && !t.state?.activity && recent && !acked.includes(last.id) && (last.type === "FOCUS" || last.type === "BREAK");

  const ack = () => {
    if (!last) return;
    const next = [...readAcked(), last.id].slice(-50);
    try {
      localStorage.setItem(ACK_KEY, JSON.stringify(next));
    } catch {}
    setAcked(next);
  };

  if (!last) return null;
  const plan = t.plan;
  const nb = t.nextBreak;
  const lf = t.state?.lastFocus;
  const wasLong = breakKindOf(last.mode) === "long";

  const startBreak = () => {
    ack();
    void t.startActivity({ type: "BREAK" }); // the provider picks short or long from the cycle
  };
  const nextFocus = () => {
    ack();
    void t.startActivity({
      type: "FOCUS",
      studyAreaId: (last.type === "FOCUS" ? last.studyAreaId : lf?.studyAreaId) ?? null,
      taskId: (last.type === "FOCUS" ? last.taskId : lf?.taskId) ?? null,
      mode: encodePlan(plan),
      plannedMinutes: plan.focus,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && ack()}>
      {last.type === "FOCUS" ? (
        <DialogContent
          title="Focus session complete 🎉"
          description={`${formatDuration(last.durationSeconds ?? 0)}${last.areaName ? ` on ${last.areaName}` : ""}${last.taskName ? ` · ${last.taskName}` : ""}.`}
        >
          <div className="mb-5 flex items-center gap-3 text-sm text-muted-foreground">
            <CycleDots completed={t.cycleCompleted} every={plan.every} />
            {nb.kind === "long" ? `All ${plan.every} done — you've earned a long break.` : `${t.cycleCompleted} of ${plan.every} before your long break.`}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={startBreak}>
              Start {nb.minutes} min {nb.kind === "long" ? "long break" : "break"}
            </Button>
            <Button variant="outline" onClick={nextFocus}>Keep studying</Button>
          </div>
          {!user.autoStartBreaks && (
            <p className="mt-4 text-[12px] text-muted-foreground">Tip: turn on auto-start in Settings → Pomodoro to skip this step.</p>
          )}
        </DialogContent>
      ) : (
        <DialogContent title={wasLong ? "Long break's over" : "Break's over"} description={wasLong ? "New cycle — fresh start." : `You rested for ${formatDuration(last.durationSeconds ?? 0)}.`}>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={nextFocus}>Start {plan.focus} min focus{lf?.areaName ? ` · ${lf.areaName}` : ""}</Button>
            <Button variant="outline" onClick={ack}>Not now</Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
