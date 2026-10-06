import {
  Atom, BookOpen, Brain, Briefcase, Calculator, Code, Dna, Dumbbell, FlaskConical, Globe, GraduationCap, Landmark, Languages, Music,
  Palette, PenTool, Scale, Sigma, Stethoscope, Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  code: Code,
  brain: Brain,
  "pen-tool": PenTool,
  calculator: Calculator,
  "flask-conical": FlaskConical,
  globe: Globe,
  languages: Languages,
  music: Music,
  palette: Palette,
  briefcase: Briefcase,
  "graduation-cap": GraduationCap,
  target: Target,
  sigma: Sigma,
  atom: Atom,
  dna: Dna,
  stethoscope: Stethoscope,
  scale: Scale,
  landmark: Landmark,
  dumbbell: Dumbbell,
};

export function iconFor(name?: string | null): LucideIcon {
  return (name && ICONS[name]) || BookOpen;
}

/** An area's icon on a softly tinted square in its own color. */
export function AreaIcon({ icon, color, className, size = "md" }: { icon?: string | null; color?: string | null; className?: string; size?: "sm" | "md" | "lg" }) {
  const Icon = iconFor(icon);
  const c = color ?? "#596273";
  const dims = size === "sm" ? "size-6 rounded-md [&_svg]:size-3.5" : size === "lg" ? "size-11 rounded-xl [&_svg]:size-5" : "size-8 rounded-lg [&_svg]:size-4";
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", dims, className)} style={{ background: `${c}1F`, color: c }}>
      <Icon strokeWidth={2} />
    </span>
  );
}
