/**
 * Pomodoro plans, shared by server and client.
 *
 * A plan is: focus length, short break, long break, and how many completed focus
 * sessions earn the long break. It travels with every block in `activity_sessions.mode`:
 *   focus  → "40/5/15x4"
 *   breaks → "S:40/5/15x4" (short) or "L:40/5/15x4" (long)
 * so a cycle keeps its own lengths even if you change your defaults halfway through.
 */

export type PomodoroPlan = { focus: number; short: number; long: number; every: number };
export type BreakKind = "short" | "long";

export const PLAN_LIMITS = {
  focus: { min: 1, max: 180 },
  short: { min: 1, max: 60 },
  long: { min: 1, max: 120 },
  every: { min: 2, max: 12 },
} as const;

export const PRESETS: Array<{ id: string; label: string; plan: PomodoroPlan }> = [
  { id: "classic", label: "25 · 5", plan: { focus: 25, short: 5, long: 15, every: 4 } },
  { id: "steady", label: "40 · 5", plan: { focus: 40, short: 5, long: 15, every: 4 } },
  { id: "deep", label: "50 · 10", plan: { focus: 50, short: 10, long: 20, every: 4 } },
  { id: "marathon", label: "90 · 15", plan: { focus: 90, short: 15, long: 30, every: 3 } },
];

export function encodePlan(p: PomodoroPlan) {
  return `${p.focus}/${p.short}/${p.long}x${p.every}`;
}

export function encodeBreak(kind: BreakKind, p: PomodoroPlan) {
  return `${kind === "long" ? "L" : "S"}:${encodePlan(p)}`;
}

export function breakKindOf(mode: string | null | undefined): BreakKind | null {
  if (!mode) return null;
  if (mode.startsWith("L:")) return "long";
  if (mode.startsWith("S:")) return "short";
  return null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

export function sanitizePlan(p: Partial<PomodoroPlan>, fallback: PomodoroPlan): PomodoroPlan {
  const pick = (k: keyof PomodoroPlan) => {
    const v = Number(p[k]);
    return Number.isFinite(v) && v > 0 ? clamp(v, PLAN_LIMITS[k].min, PLAN_LIMITS[k].max) : fallback[k];
  };
  return { focus: pick("focus"), short: pick("short"), long: pick("long"), every: pick("every") };
}

/** Reads "40/5/15x4", "S:40/5/15x4" and the older "25/5" format. Falls back field by field. */
export function decodePlan(mode: string | null | undefined, fallback: PomodoroPlan): PomodoroPlan {
  if (!mode) return fallback;
  const m = mode.replace(/^[SL]:/, "").match(/^(\d+)\/(\d+)(?:\/(\d+))?(?:x(\d+))?$/);
  if (!m) return fallback;
  return sanitizePlan({ focus: +m[1]!, short: +m[2]!, long: m[3] ? +m[3] : undefined, every: m[4] ? +m[4] : undefined }, fallback);
}

/**
 * Which break comes next. `completedInCycle` counts focus sessions that ran to zero since
 * the last long break (including the one just finished). Once it reaches `every`, the long
 * break is due — and stays due until you take one.
 */
export function nextBreak(completedInCycle: number, plan: PomodoroPlan): { kind: BreakKind; minutes: number } {
  return completedInCycle >= plan.every ? { kind: "long", minutes: plan.long } : { kind: "short", minutes: plan.short };
}

export function samePlan(a: PomodoroPlan, b: PomodoroPlan) {
  return a.focus === b.focus && a.short === b.short && a.long === b.long && a.every === b.every;
}

export function describePlan(p: PomodoroPlan) {
  return `${p.focus} min focus → ${p.short} min break · ${p.long} min long break after every ${p.every}`;
}
