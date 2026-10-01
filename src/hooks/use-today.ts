"use client";
import useSWR from "swr";
import { useTracker } from "@/components/tracker-provider";
import type { DayAnalytics } from "@/lib/types";

/** Today's analytics with the currently running block added live between refreshes. */
export function useToday() {
  const t = useTracker();
  const swr = useSWR<DayAnalytics>("/api/analytics/day", { refreshInterval: 60_000 });
  const d = swr.data;
  if (!d) return { ...swr, live: undefined };
  const a = t.state?.activity;
  const dayActive = t.state?.day?.status === "ACTIVE";
  const delta = Math.max(0, Math.floor((t.now - new Date(d.generatedAt).getTime()) / 1000));
  const totals = { ...d.totals };
  let subjects = d.subjects;
  if (dayActive && delta > 0) {
    totals.session += delta;
    if (a && !a.paused) {
      const k = ({ FOCUS: "focus", BREAK: "break", PHONE: "phone", OTHER: "other" } as const)[a.type];
      totals[k] += delta;
      if (a.type === "FOCUS") {
        const id = a.studyArea?.id ?? "none";
        const found = subjects.some((s) => s.id === id);
        subjects = found
          ? subjects.map((s) => (s.id === id ? { ...s, seconds: s.seconds + delta } : s))
          : [...subjects, { id, name: a.studyArea?.name ?? "Unassigned", color: a.studyArea?.color ?? "#8A9290", icon: a.studyArea?.icon ?? "book-open", seconds: delta }];
        subjects = [...subjects].sort((x, y) => y.seconds - x.seconds);
      }
    } else totals.idle += delta;
  }
  const productivity = totals.session > 0 ? Math.min(100, Math.round((totals.focus / totals.session) * 100)) : null;
  return { ...swr, live: { ...d, totals, subjects, productivity } };
}
