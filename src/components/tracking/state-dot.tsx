import { ACTIVITY_COLOR_VAR } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StateDot({ type, pulsing, className }: { type: keyof typeof ACTIVITY_COLOR_VAR; pulsing?: boolean; className?: string }) {
  const color = ACTIVITY_COLOR_VAR[type];
  return (
    <span className={cn("relative inline-flex size-2.5 shrink-0", className)} aria-hidden>
      {pulsing && <span className="absolute inset-0 animate-ping rounded-full opacity-40 motion-reduce:hidden" style={{ background: color }} />}
      <span className="relative inline-flex size-2.5 rounded-full" style={{ background: color }} />
    </span>
  );
}
