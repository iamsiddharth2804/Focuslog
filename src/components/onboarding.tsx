"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AREA_COLORS, guessIcon } from "@/lib/constants";
import { api, ApiClientError } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

/* Starting points for every kind of learner — nobody has to pick from these; anything can be typed. */
const SUGGESTION_GROUPS: Array<{ id: string; label: string; items: string[] }> = [
  { id: "school", label: "School & boards", items: ["Maths", "Physics", "Chemistry", "Biology", "English", "History", "Geography", "Economics", "Accountancy", "Computer Science"] },
  { id: "exams", label: "Competitive exams", items: ["UPSC", "NEET", "JEE", "CAT", "GATE", "SSC", "Banking", "CA", "CLAT", "GRE / GMAT", "IELTS"] },
  { id: "college", label: "College", items: ["Semester exams", "Assignments", "Lab work", "Research / Thesis", "Projects", "Internship prep"] },
  { id: "skills", label: "Skills & career", items: ["Programming", "Design", "Data analysis", "Marketing", "Writing", "Interview prep", "Certification"] },
  { id: "languages", label: "Languages", items: ["English", "Hindi", "Spanish", "French", "German", "Japanese"] },
  { id: "personal", label: "Creative & personal", items: ["Music practice", "Drawing", "Reading", "Side project", "Fitness"] },
];
const DAILY = [2, 4, 6, 8];
const WEEKLY = [20, 30, 40];

export function Onboarding({ name }: { name: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [areas, setAreas] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [group, setGroup] = useState(SUGGESTION_GROUPS[0]!.id);
  const [daily, setDaily] = useState<number | "custom">(4);
  const [dailyCustom, setDailyCustom] = useState("5");
  const [weekly, setWeekly] = useState<number | "custom">(30);
  const [weeklyCustom, setWeeklyCustom] = useState("25");
  const [saving, setSaving] = useState(false);

  const add = (n: string) => {
    const v = n.trim();
    if (!v || areas.some((a) => a.toLowerCase() === v.toLowerCase()) || areas.length >= 12) return;
    setAreas((a) => [...a, v]);
    setDraft("");
  };

  const dailyHours = daily === "custom" ? Number(dailyCustom) : daily;
  const weeklyHours = weekly === "custom" ? Number(weeklyCustom) : weekly;

  async function finish() {
    setSaving(true);
    try {
      await api("/api/onboarding", {
        body: {
          areas: areas.map((n, i) => ({ name: n, color: AREA_COLORS[i % AREA_COLORS.length], icon: guessIcon(n) })),
          dailyGoalMinutes: Math.round(dailyHours * 60),
          weeklyGoalMinutes: Math.round(weeklyHours * 60),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  const steps = [
    {
      title: "What are you working on?",
      body: "Add anything you want to track — subjects, an exam, a course, a skill or a project. Type your own or pick from the ideas below. You can change these any time.",
      valid: areas.length > 0,
      content: (
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add(draft);
            }}
            className="flex gap-2"
          >
            <Input autoFocus placeholder="Type anything — e.g. Physics, UPSC, Guitar" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} aria-label="Area name" />
            <Button type="submit" variant="outline" size="icon" className="size-10 shrink-0" aria-label="Add">
              <Plus />
            </Button>
          </form>
          {areas.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {areas.map((a, i) => (
                <li key={a} className="inline-flex items-center gap-2 rounded-lg border bg-card py-1.5 pl-2.5 pr-1.5 text-sm">
                  <span className="size-2 rounded-full" style={{ background: AREA_COLORS[i % AREA_COLORS.length] }} />
                  {a}
                  <button onClick={() => setAreas((x) => x.filter((y) => y !== a))} className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label={`Remove ${a}`}>
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mb-2 mt-7 text-[13px] text-muted-foreground">Need ideas? What are you preparing for?</p>
          <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Idea groups">
            {SUGGESTION_GROUPS.map((g) => (
              <button
                key={g.id}
                role="tab"
                aria-selected={group === g.id}
                onClick={() => setGroup(g.id)}
                className={cn("shrink-0 rounded-full border px-3 py-1 text-[13px] transition-colors", group === g.id ? "border-primary bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-muted")}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTION_GROUPS.find((g) => g.id === group)!.items.filter((x) => !areas.some((a) => a.toLowerCase() === x.toLowerCase())).map((x) => (
              <button key={x} onClick={() => add(x)} className="rounded-lg border border-dashed px-2.5 py-1.5 text-sm text-muted-foreground hover:border-solid hover:text-foreground">
                + {x}
              </button>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "How many hours a day do you want to put in?",
      body: "Counted only from real focus sessions — not from having the app open.",
      valid: dailyHours >= 0.25 && dailyHours <= 24,
      content: (
        <Choice options={DAILY.map((h) => ({ v: h, l: `${h} hours` }))} value={daily} onChange={setDaily} custom={dailyCustom} setCustom={setDailyCustom} unit="hours / day" />
      ),
    },
    {
      title: "What is your weekly goal?",
      body: "A weekly target smooths out busy days and rest days.",
      valid: weeklyHours >= 1 && weeklyHours <= 168,
      content: (
        <Choice options={WEEKLY.map((h) => ({ v: h, l: `${h} hours / week` }))} value={weekly} onChange={setWeekly} custom={weeklyCustom} setCustom={setWeeklyCustom} unit="hours / week" />
      ),
    },
  ];
  const s = steps[step]!;

  return (
    <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-10">
      <div className="flex items-center justify-between">
        <Logo />
        <ol className="flex items-center gap-1.5" aria-label="Progress">
          {steps.map((_, i) => (
            <li key={i} className={cn("h-1.5 w-8 rounded-full bg-muted transition-colors", i <= step && "bg-primary")} aria-current={i === step ? "step" : undefined}>
              <span className="sr-only">Step {i + 1}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center py-12">
        {step === 0 && <p className="mb-3 text-sm text-muted-foreground">Hi {name} — three quick questions.</p>}
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{s.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            <div className="mt-8">{s.content}</div>
          </motion.div>
        </AnimatePresence>
        <div className="mt-10 flex items-center justify-between">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Back
            </Button>
          ) : (
            <span />
          )}
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!s.valid}>Continue</Button>
          ) : (
            <Button onClick={finish} disabled={!s.valid || saving}>
              {saving && <Loader2 className="animate-spin" />}
              Finish setup
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Choice({
  options,
  value,
  onChange,
  custom,
  setCustom,
  unit,
}: {
  options: { v: number; l: string }[];
  value: number | "custom";
  onChange: (v: number | "custom") => void;
  custom: string;
  setCustom: (v: string) => void;
  unit: string;
}) {
  return (
    <div className="grid gap-2" role="radiogroup">
      {[...options, { v: -1, l: "Custom" }].map((o) => {
        const isCustom = o.v === -1;
        const selected = isCustom ? value === "custom" : value === o.v;
        return (
          <button
            key={o.l}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(isCustom ? "custom" : o.v)}
            className={cn("flex h-12 items-center justify-between rounded-xl border bg-card px-4 text-left text-[15px] transition-colors", selected ? "border-primary ring-1 ring-primary" : "hover:bg-muted/60")}
          >
            {o.l}
            <span className={cn("size-4 rounded-full border-2", selected ? "border-primary bg-primary shadow-[inset_0_0_0_2px_hsl(var(--card))]" : "border-input")} />
          </button>
        );
      })}
      {value === "custom" && (
        <div className="mt-2 flex items-center gap-3">
          <Input type="number" min={0.25} step={0.25} value={custom} onChange={(e) => setCustom(e.target.value)} className="w-28" autoFocus aria-label="Custom hours" />
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
      )}
    </div>
  );
}
