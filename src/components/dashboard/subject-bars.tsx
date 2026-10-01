import Link from "next/link";
import { formatDuration } from "@/lib/time";

export function SubjectBars({ subjects, linkable = true }: { subjects: Array<{ id: string; name: string; color: string; seconds: number }>; linkable?: boolean }) {
  const max = Math.max(...subjects.map((s) => s.seconds), 1);
  return (
    <ul className="space-y-3.5">
      {subjects.map((s) => {
        const row = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[14px] font-medium">{s.name}</span>
              <span className="tnum shrink-0 text-[13px] text-muted-foreground">{formatDuration(s.seconds)}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(s.seconds / max) * 100}%`, background: s.color }} />
            </div>
          </>
        );
        return (
          <li key={s.id}>
            {linkable && s.id !== "none" ? (
              <Link href={`/study/${s.id}`} className="-mx-2 block rounded-lg px-2 py-1 hover:bg-muted/60">
                {row}
              </Link>
            ) : (
              <div className="py-1">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
