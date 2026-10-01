import { formatDuration } from "@/lib/time";

/** Transparent score: focused study ÷ active session time. No hidden weights. */
export function ProductivityExplainer({ focus, session, score }: { focus: number; session: number; score: number | null }) {
  return (
    <div>
      <p className="tnum text-[32px] font-semibold leading-none tracking-tight">{score === null ? "—" : `${score}%`}</p>
      <div className="mt-3 inline-grid grid-cols-[auto_auto] items-baseline gap-x-2 text-[13px]">
        <span className="tnum font-medium">{formatDuration(focus)}</span>
        <span className="text-muted-foreground">focused study</span>
        <span className="tnum border-t pt-0.5 font-medium">{formatDuration(session)}</span>
        <span className="border-t pt-0.5 text-muted-foreground">active session</span>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">Focused study ÷ session time (pauses excluded) × 100.</p>
    </div>
  );
}
