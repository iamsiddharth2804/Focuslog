import { formatDuration } from "@/lib/time";

/*
 * Insights are produced by an InsightProvider. V1 ships only the deterministic,
 * rule-based provider below. A future AI provider can implement the same interface
 * and receive the same InsightContext (already-computed numbers, never raw rows),
 * so the UI and API stay unchanged.
 */

export type Insight = {
  id: string;
  tone: "neutral" | "positive" | "attention";
  text: string;
  /** How the number was produced, shown on hover so nothing is a black box. */
  basis?: string;
};

export type InsightContext = {
  period: "day" | "week" | "month" | "year";
  focusSec: number;
  prevFocusSec: number;
  phoneSec: number;
  breakSec: number;
  sessionSec: number;
  subjects: Array<{ name: string; seconds: number }>;
  hourly: Array<{ hour: number; focus: number }>;
  taskRate: number | null;
  tasksCompleted: number;
  studiedDays: number;
  elapsedDays: number;
};

export interface InsightProvider {
  name: string;
  generate(ctx: InsightContext): Insight[] | Promise<Insight[]>;
}

const periodWord = { day: "today", week: "this week", month: "this month", year: "this year" } as const;
const prevWord = { day: "yesterday", week: "last week", month: "last month", year: "last year" } as const;

function hourLabel(h: number) {
  const suffix = h < 12 || h === 24 ? "AM" : "PM";
  const v = h % 12 === 0 ? 12 : h % 12;
  return `${v} ${suffix}`;
}

export function ruleBasedInsights(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  const when = periodWord[ctx.period];

  if (ctx.focusSec === 0) {
    return [{ id: "none", tone: "neutral", text: `No study time recorded ${when} yet.` }];
  }

  out.push({ id: "total", tone: "neutral", text: `You studied ${formatDuration(ctx.focusSec)} ${when}.` });

  if (ctx.prevFocusSec > 0) {
    const change = Math.round(((ctx.focusSec - ctx.prevFocusSec) / ctx.prevFocusSec) * 100);
    if (Math.abs(change) >= 5) {
      out.push({
        id: "trend",
        tone: change > 0 ? "positive" : "attention",
        text: `That's ${Math.abs(change)}% ${change > 0 ? "more" : "less"} than ${prevWord[ctx.period]} (${formatDuration(ctx.prevFocusSec)}).`,
        basis: "Compares total focused study time with the previous period of the same length.",
      });
    }
  }

  const top = ctx.subjects[0];
  if (top) {
    const share = Math.round((top.seconds / ctx.focusSec) * 100);
    out.push({
      id: "top-subject",
      tone: "neutral",
      text: `Most studied: ${top.name}, ${formatDuration(top.seconds)} (${share}% of study time).`,
    });
  }

  // Best 3-hour window by focused time.
  let best = { start: 0, sec: 0 };
  for (let h = 0; h <= 21; h++) {
    const sec = ctx.hourly.slice(h, h + 3).reduce((a, x) => a + x.focus, 0);
    if (sec > best.sec) best = { start: h, sec };
  }
  if (best.sec >= 1800) {
    out.push({
      id: "peak",
      tone: "positive",
      text: `Your most focused window is ${hourLabel(best.start)} – ${hourLabel(best.start + 3)}.`,
      basis: "The 3-hour window with the most focused study time in this period.",
    });
  }

  if (ctx.taskRate !== null) {
    out.push({
      id: "tasks",
      tone: ctx.taskRate >= 70 ? "positive" : "neutral",
      text: `You completed ${ctx.taskRate}% of the tasks you planned or worked on (${ctx.tasksCompleted} done).`,
      basis: "Planned = tasks you studied, completed, or that were due in this period.",
    });
  }

  if (ctx.phoneSec >= 600) {
    const share = ctx.sessionSec ? Math.round((ctx.phoneSec / ctx.sessionSec) * 100) : 0;
    out.push({
      id: "phone",
      tone: share >= 15 ? "attention" : "neutral",
      text: `You logged ${formatDuration(ctx.phoneSec)} on phone/distractions${share ? ` — ${share}% of session time` : ""}.`,
    });
  }

  if (ctx.period !== "day" && ctx.elapsedDays > 1) {
    out.push({
      id: "consistency",
      tone: ctx.studiedDays / ctx.elapsedDays >= 0.7 ? "positive" : "neutral",
      text: `You studied on ${ctx.studiedDays} of ${ctx.elapsedDays} days.`,
    });
  }

  return out;
}

export const ruleBasedProvider: InsightProvider = { name: "rules", generate: ruleBasedInsights };
