/**
 * Time math shared by server and client.
 * Durations are ALWAYS derived from timestamps (started/paused/resumed/ended),
 * never from a running counter.
 */
import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";

export type Interval = { start: number; end: number };
export type PauseLike = { pausedAt: Date | string; resumedAt: Date | string | null };

const ms = (d: Date | string) => (typeof d === "string" ? new Date(d).getTime() : d.getTime());

/** Active (un-paused) intervals of something that started, maybe ended, with pauses. */
export function activeIntervals(
  startedAt: Date | string,
  endedAt: Date | string | null,
  pauses: PauseLike[],
  now: Date | number = Date.now(),
): Interval[] {
  const start = ms(startedAt);
  const end = endedAt ? ms(endedAt) : typeof now === "number" ? now : now.getTime();
  if (end <= start) return [];
  const sorted = [...pauses].sort((a, b) => ms(a.pausedAt) - ms(b.pausedAt));
  const out: Interval[] = [];
  let cursor = start;
  for (const p of sorted) {
    const ps = Math.max(ms(p.pausedAt), cursor);
    const pe = Math.min(p.resumedAt ? ms(p.resumedAt) : end, end);
    if (ps >= end) break;
    if (ps > cursor) out.push({ start: cursor, end: ps });
    cursor = Math.max(cursor, pe);
  }
  if (cursor < end) out.push({ start: cursor, end });
  return out;
}

export function sumSeconds(intervals: Interval[]) {
  return Math.floor(intervals.reduce((acc, i) => acc + (i.end - i.start), 0) / 1000);
}

export function clip(intervals: Interval[], start: number, end: number): Interval[] {
  return intervals
    .map((i) => ({ start: Math.max(i.start, start), end: Math.min(i.end, end) }))
    .filter((i) => i.end > i.start);
}

/** "4h 32m" · "25m" · "0m" · with seconds when < 1 minute if asked */
export function formatDuration(seconds: number, opts: { seconds?: boolean } = {}) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (opts.seconds && h === 0 && m === 0) return `${s}s`;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m.toString().padStart(2, "0")}m`;
}

/** "05:42:18" (always hours) or "24:59" (compact) */
export function formatClock(seconds: number, compact = false) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (compact && h === 0) return `${pad(m)}:${pad(sec)}`;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/* ─────────────── Timezone helpers ─────────────── */

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** yyyy-MM-dd for the instant in the given timezone */
export function localDateKey(date: Date | number, tz: string) {
  return format(new TZDate(typeof date === "number" ? date : date.getTime(), tz), "yyyy-MM-dd");
}

/** [start, end) instants of a local calendar day */
export function dayBounds(dateKey: string, tz: string) {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const start = new TZDate(y, m - 1, d, tz);
  const end = addDays(start, 1);
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

export function localHour(date: number, tz: string) {
  return new TZDate(date, tz).getHours();
}

export function addDaysToKey(dateKey: string, n: number) {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Monday-based week start for a date key */
export function weekStartKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  const diff = (dow + 6) % 7;
  return addDaysToKey(dateKey, -diff);
}

export function eachDayKey(fromKey: string, toKeyInclusive: string) {
  const out: string[] = [];
  let k = fromKey;
  while (k <= toKeyInclusive) {
    out.push(k);
    k = addDaysToKey(k, 1);
  }
  return out;
}

export function formatDateKey(dateKey: string, pattern = "EEEE, MMMM d") {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  return format(new Date(y, m - 1, d), pattern);
}

export function formatTimeInTz(date: Date | string | number, tz: string, pattern = "h:mm a") {
  const t = typeof date === "string" ? new Date(date).getTime() : typeof date === "number" ? date : date.getTime();
  return format(new TZDate(t, tz), pattern);
}
