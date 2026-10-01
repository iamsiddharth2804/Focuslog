"use client";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { formatDuration, formatDateKey } from "@/lib/time";
import { cn } from "@/lib/utils";

/* Recharts writes colors into SVG attributes, where CSS variables are unreliable — resolve them to real values. */
const VARS = ["state-focus", "state-break", "state-phone", "state-other", "state-idle", "muted-foreground", "border", "muted", "card", "foreground"] as const;
type Palette = Record<(typeof VARS)[number], string>;
const FALLBACK: Palette = {
  "state-focus": "#335f52", "state-break": "#b38a29", "state-phone": "#b65d55", "state-other": "#5f7f9f", "state-idle": "#c7cdc8",
  "muted-foreground": "#646b72", border: "#dde3dd", muted: "#ebeeea", card: "#ffffff", foreground: "#1b1f23",
};

export function useChartColors(): Palette {
  const { resolvedTheme } = useTheme();
  const [p, setP] = useState<Palette>(FALLBACK);
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const next = {} as Palette;
    for (const v of VARS) {
      const raw = cs.getPropertyValue(`--${v}`).trim();
      next[v] = raw ? `hsl(${raw.replace(/ /g, ", ").replace(/,\s*,/g, ",")})` : FALLBACK[v];
    }
    setP(next);
  }, [resolvedTheme]);
  return p;
}

const axisTick = (c: Palette) => ({ fill: c["muted-foreground"], fontSize: 11 });
const hoursTick = (v: number) => (v === 0 ? "0" : `${+(v / 3600).toFixed(1)}h`);

function ChartTip({ active, payload, label, labelFormat }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string; payload?: Record<string, unknown> }>; label?: string | number; labelFormat?: (l: string | number) => string }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value > 0);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-[12px] shadow-md">
      {label !== undefined && <p className="mb-1 font-medium">{labelFormat ? labelFormat(label) : label}</p>}
      {rows.length ? rows.map((p) => (
        <p key={p.name} className="tnum flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}<span className="ml-auto pl-3 text-foreground">{formatDuration(p.value)}</span>
        </p>
      )) : <p className="text-muted-foreground">Nothing logged</p>}
    </div>
  );
}

/** Stacked study / break / phone bars per bucket (hours of the day, days of the week or month, months of the year). */
export function StackedTimeBars({ data, xKey, xFormat, labelFormat, height = 220, keys = ["focus", "break", "phone"] }: {
  data: ReadonlyArray<object>; xKey: string; xFormat?: (v: string | number) => string; labelFormat?: (v: string | number) => string; height?: number; keys?: Array<"focus" | "break" | "phone" | "other">;
}) {
  const c = useChartColors();
  const color = { focus: c["state-focus"], break: c["state-break"], phone: c["state-phone"], other: c["state-other"] };
  const name = { focus: "Study", break: "Break", phone: "Phone", other: "Other" };
  return (
    <div style={{ height }} className="-ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data as Array<Record<string, unknown>>} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={c.border} strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={axisTick(c)} tickFormatter={xFormat} interval="preserveStartEnd" minTickGap={6} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick(c)} tickFormatter={hoursTick} width={36} allowDecimals={false} />
          <RTooltip cursor={{ fill: c.muted, opacity: 0.6 }} content={<ChartTip labelFormat={labelFormat ?? xFormat} />} />
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} name={name[k]} stackId="a" fill={color[k]} radius={i === keys.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Donut + legend. Used for subject distribution and for where the session went. */
export function Donut({ items, centerLabel, centerValue }: { items: Array<{ id: string; name: string; color: string; seconds: number }>; centerLabel: string; centerValue: string }) {
  const c = useChartColors();
  const total = items.reduce((a, b) => a + b.seconds, 0);
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative size-[168px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={total ? items : [{ id: "e", name: "", color: c.muted, seconds: 1 }]} dataKey="seconds" nameKey="name" innerRadius={58} outerRadius={80} paddingAngle={total && items.length > 1 ? 1.5 : 0} stroke="none" isAnimationActive={false}>
              {(total ? items : [{ color: c.muted }]).map((it, i) => <Cell key={i} fill={resolveColor(it.color, c)} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="tnum text-[18px] font-semibold tracking-tight">{centerValue}</p>
          <p className="text-[11px] text-muted-foreground">{centerLabel}</p>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2.5 text-[13px]">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: it.color }} />
            <span className="truncate">{it.name}</span>
            <span className="tnum ml-auto shrink-0 text-muted-foreground">{formatDuration(it.seconds)}</span>
            <span className="tnum w-10 shrink-0 text-right text-[12px] text-muted-foreground">{total ? Math.round((it.seconds / total) * 100) : 0}%</span>
          </li>
        ))}
        {!items.length && <li className="text-[13px] text-muted-foreground">Nothing logged.</li>}
      </ul>
    </div>
  );
}

function resolveColor(color: string, c: Palette) {
  const m = color.match(/^hsl\(var\(--([\w-]+)\)\)$/);
  return m ? (c[m[1] as keyof Palette] ?? color) : color;
}

export function TaskCompletion({ completed, planned, rate }: { completed: number; planned: number; rate: number | null }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 80 80" className="size-20 -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
        <circle cx="40" cy="40" r={R} fill="none" stroke="hsl(var(--primary))" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (rate ?? 0) / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div>
        <p className="tnum text-[26px] font-semibold tracking-tight">{rate === null ? "—" : `${rate}%`}</p>
        <p className="tnum text-[13px] text-muted-foreground">{completed} of {planned} planned tasks done</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Planned = tasks you worked on, finished, or had due.</p>
      </div>
    </div>
  );
}

export function Insights({ items }: { items: Array<{ id: string; tone: string; text: string; basis?: string }> }) {
  if (!items.length) return <p className="text-[13px] text-muted-foreground">Insights appear once there&apos;s enough tracked time.</p>;
  return (
    <ul className="space-y-3">
      {items.map((i) => {
        const Icon = i.tone === "positive" ? TrendingUp : i.tone === "attention" ? TrendingDown : Lightbulb;
        return (
          <li key={i.id} className="flex gap-3">
            <span className={cn("mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md",
              i.tone === "positive" ? "bg-accent text-primary" : i.tone === "attention" ? "bg-[hsl(var(--state-phone)/0.12)] text-[hsl(var(--state-phone))]" : "bg-muted text-muted-foreground")}>
              <Icon className="size-3.5" />
            </span>
            <div>
              <p className="text-[14px] leading-snug">{i.text}</p>
              {i.basis && <p className="mt-0.5 text-[12px] text-muted-foreground">{i.basis}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ───────── GitHub-style heatmap ───────── */

type HeatDay = { date: string; focus: number; focusSessions: number; tasksCompleted: number };

export function level(focus: number) {
  if (focus <= 0) return 0;
  if (focus < 3600) return 1;
  if (focus < 2 * 3600) return 2;
  if (focus < 4 * 3600) return 3;
  return 4;
}
export const LEVEL_BG = [
  "hsl(var(--muted))",
  "hsl(var(--state-focus) / 0.28)",
  "hsl(var(--state-focus) / 0.5)",
  "hsl(var(--state-focus) / 0.75)",
  "hsl(var(--state-focus))",
];

export function Heatmap({ year, days, today, onSelect }: { year: number; days: HeatDay[]; today: string; onSelect?: (date: string) => void }) {
  const [hover, setHover] = useState<{ d: HeatDay; x: number; y: number } | null>(null);
  const map = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  const weeks = useMemo(() => {
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const lead = (jan1.getUTCDay() + 6) % 7; // Monday-first rows
    const cells: Array<string | null> = Array(lead).fill(null);
    for (let d = new Date(jan1); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) cells.push(d.toISOString().slice(0, 10));
    while (cells.length % 7) cells.push(null);
    const cols: Array<Array<string | null>> = [];
    for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
    return cols;
  }, [year]);

  const monthLabels = weeks.map((w, i) => {
    const firstOfMonth = w.find((k) => k && k.endsWith("-01"));
    return firstOfMonth || (i === 0 && w.find(Boolean)) ? formatDateKey((firstOfMonth || w.find(Boolean))!, "MMM") : "";
  });

  return (
    <div className="relative" data-heat-host>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-full flex-col gap-1">
          <div className="ml-7 flex gap-[3px] text-[10px] text-muted-foreground">
            {monthLabels.map((m, i) => <span key={i} className="w-[11px] shrink-0 overflow-visible whitespace-nowrap">{m}</span>)}
          </div>
          <div className="flex gap-[3px]">
            <div className="mr-1 flex w-6 flex-col gap-[3px] text-[10px] text-muted-foreground">
              {["Mon", "", "Wed", "", "Fri", "", ""].map((l, i) => <span key={i} className="h-[11px] leading-[11px]">{l}</span>)}
            </div>
            {weeks.map((w, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {w.map((k, di) => {
                  if (!k) return <span key={di} className="size-[11px]" />;
                  const d = map.get(k) ?? { date: k, focus: 0, focusSessions: 0, tasksCompleted: 0 };
                  const future = k > today;
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={future}
                      aria-label={`${formatDateKey(k, "MMMM d")}: ${formatDuration(d.focus)} focused, ${d.focusSessions} sessions, ${d.tasksCompleted} tasks completed`}
                      onClick={() => onSelect?.(k)}
                      onMouseEnter={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const host = (e.currentTarget.closest("[data-heat-host]") as HTMLElement).getBoundingClientRect();
                        setHover({ d, x: r.left - host.left + r.width / 2, y: r.top - host.top });
                      }}
                      onFocus={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const host = (e.currentTarget.closest("[data-heat-host]") as HTMLElement).getBoundingClientRect();
                        setHover({ d, x: r.left - host.left + r.width / 2, y: r.top - host.top });
                      }}
                      onMouseLeave={() => setHover(null)}
                      onBlur={() => setHover(null)}
                      className={cn("size-[11px] rounded-[2px] transition-transform hover:scale-125 focus-visible:ring-1 focus-visible:ring-offset-0", future && "opacity-40", k === today && "outline outline-1 outline-offset-1 outline-foreground/40")}
                      style={{ background: LEVEL_BG[level(d.focus)] }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
        Less {LEVEL_BG.map((bg, i) => <span key={i} className="size-[11px] rounded-[2px]" style={{ background: bg }} />)} More
      </div>
      {hover && (
        <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-3 py-2 text-[12px] shadow-md" style={{ left: hover.x, top: hover.y - 6 }}>
          <p className="font-medium">{formatDateKey(hover.d.date, "MMMM d")}</p>
          <p className="tnum text-muted-foreground">{formatDuration(hover.d.focus)} focused</p>
          <p className="tnum text-muted-foreground">{hover.d.focusSessions} sessions · {hover.d.tasksCompleted} tasks completed</p>
        </div>
      )}
    </div>
  );
}
