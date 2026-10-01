import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function PageHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-[14px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon: Icon, title, body, action, className }: { icon?: LucideIcon; title: string; body?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center", className)}>
      {Icon && (
        <span className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
      )}
      <p className="text-[15px] font-medium">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, color, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        {color && <span className="size-2 rounded-full" style={{ background: color }} />}
        {label}
      </p>
      <p className="tnum mt-1 truncate text-[22px] font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function ErrorNotice({ message = "Couldn't load this. Check your connection.", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
      {message}
      {onRetry && (
        <button onClick={onRetry} className="font-medium underline underline-offset-4">
          Retry
        </button>
      )}
    </div>
  );
}
