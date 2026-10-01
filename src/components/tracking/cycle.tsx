"use client";
import { cn } from "@/lib/utils";

/**
 * ●●◐○  — where you are in the pomodoro cycle. Filled = focus sessions completed since the
 * last long break; the pulsing one is the focus block running now.
 */
export function CycleDots({ completed, every, runningFocus, className }: { completed: number; every: number; runningFocus?: boolean; className?: string }) {
  const done = Math.min(completed, every);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} role="img" aria-label={`${done} of ${every} focus sessions done before the long break`}>
      {Array.from({ length: every }).map((_, i) => {
        const filled = i < done;
        const current = !filled && runningFocus && i === done;
        return (
          <span
            key={i}
            className={cn(
              "size-2 rounded-full transition-colors",
              filled ? "bg-[hsl(var(--state-focus))]" : current ? "animate-pulse bg-[hsl(var(--state-focus)/0.45)]" : "bg-muted-foreground/20",
            )}
          />
        );
      })}
    </span>
  );
}
