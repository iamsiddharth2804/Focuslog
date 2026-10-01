/** Mark: a day strip — three blocks of unequal length, the product's core idea. */
export function Logo({ withText = true }: { withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <rect x="1" y="4" width="20" height="14" rx="4" className="fill-primary" />
        <rect x="4.5" y="9.5" width="7" height="3" rx="1.5" className="fill-primary-foreground" />
        <rect x="12.5" y="9.5" width="2" height="3" rx="1" className="fill-primary-foreground/60" />
        <rect x="15.5" y="9.5" width="2" height="3" rx="1" className="fill-primary-foreground" />
      </svg>
      {withText && <span className="text-[15px] font-semibold tracking-tight">FocusLog</span>}
    </span>
  );
}
