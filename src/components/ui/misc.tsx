"use client";
import * as React from "react";
import * as C from "@radix-ui/react-checkbox";
import * as TT from "@radix-ui/react-tooltip";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export function Progress({ value, className, color }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground", className)} {...props} />;
}

export const Checkbox = React.forwardRef<HTMLButtonElement, React.ComponentProps<typeof C.Root>>(({ className, ...props }, ref) => (
  <C.Root
    ref={ref}
    className={cn(
      "peer size-[18px] shrink-0 rounded-[5px] border border-input bg-card transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      className,
    )}
    {...props}
  >
    <C.Indicator className="flex items-center justify-center">
      <Check className="size-3" strokeWidth={3} />
    </C.Indicator>
  </C.Root>
));
Checkbox.displayName = "Checkbox";

export const TooltipProvider = TT.Provider;
export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TT.Root delayDuration={150}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-lg border bg-popover px-3 py-2 text-[12px] text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          {content}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}
