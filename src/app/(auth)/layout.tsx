import { Logo } from "@/components/shell/logo";

/* A quiet, honest preview of what the product does: one real-looking day, as a strip. */
const DEMO = [
  { t: "FOCUS", w: 14 },
  { t: "BREAK", w: 3 },
  { t: "FOCUS", w: 22 },
  { t: "PHONE", w: 6 },
  { t: "FOCUS", w: 17 },
  { t: "IDLE", w: 4 },
  { t: "BREAK", w: 6 },
  { t: "FOCUS", w: 20 },
  { t: "PHONE", w: 8 },
] as const;
const COLOR = { FOCUS: "var(--state-focus)", BREAK: "var(--state-break)", PHONE: "var(--state-phone)", IDLE: "var(--state-idle)" };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r bg-card p-12 lg:flex">
        <Logo />
        <div className="max-w-md">
          <p className="text-[34px] font-semibold leading-[1.1] tracking-tight">
            Six hours in the library.
            <br />
            <span className="text-muted-foreground">Here is where they went.</span>
          </p>
          <div className="mt-10">
            <div className="flex h-10 w-full gap-[3px] overflow-hidden rounded-lg">
              {DEMO.map((d, i) => (
                <div key={i} className="h-full rounded-[3px]" style={{ flexGrow: d.w, background: `hsl(${COLOR[d.t]})` }} />
              ))}
            </div>
            <div className="mt-3 flex justify-between text-[12px] text-muted-foreground tnum">
              <span>8:42 AM</span>
              <span>2:56 PM</span>
            </div>
            <dl className="mt-8 grid grid-cols-3 gap-6 text-sm">
              <div>
                <dt className="text-muted-foreground">Studied</dt>
                <dd className="mt-1 text-xl font-semibold tnum">4h 42m</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Breaks</dt>
                <dd className="mt-1 text-xl font-semibold tnum">38m</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="mt-1 text-xl font-semibold tnum">40m</dd>
              </div>
            </dl>
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground">Track reality, not productivity theatre.</p>
      </section>
      <section className="flex flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10">{children}</div>
      </section>
    </div>
  );
}
