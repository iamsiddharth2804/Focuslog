export const ACTIVITY_TYPES = ["FOCUS", "BREAK", "PHONE", "OTHER"] as const;
export type ActivityKind = (typeof ACTIVITY_TYPES)[number];

/** User-facing names. FOCUS is "Study" everywhere in the UI. */
export const ACTIVITY_LABEL: Record<ActivityKind | "IDLE", string> = {
  FOCUS: "Study",
  BREAK: "Break",
  PHONE: "Phone",
  OTHER: "Other",
  IDLE: "Idle",
};

export const ACTIVITY_COLOR_VAR: Record<ActivityKind | "IDLE", string> = {
  FOCUS: "hsl(var(--state-focus))",
  BREAK: "hsl(var(--state-break))",
  PHONE: "hsl(var(--state-phone))",
  OTHER: "hsl(var(--state-other))",
  IDLE: "hsl(var(--state-idle))",
};

/* Pomodoro presets and plan logic live in ./pomodoro.ts */

export const AREA_COLORS = [
  "#2E5E4E", // lamp green
  "#3D5A80", // ink blue
  "#9C6B30", // leather
  "#8E3B46", // oxblood
  "#5B4B8A", // plum
  "#2F7A8C", // teal
  "#6B7F3A", // olive
  "#596273", // slate
] as const;

export const AREA_ICONS = [
  "book-open",
  "graduation-cap",
  "target",
  "brain",
  "pen-tool",
  "calculator",
  "sigma",
  "atom",
  "flask-conical",
  "dna",
  "stethoscope",
  "scale",
  "landmark",
  "globe",
  "languages",
  "briefcase",
  "code",
  "palette",
  "music",
  "dumbbell",
] as const;

/**
 * A sensible starting icon from an area's name ("Physics" → atom, "NEET" → stethoscope).
 * Only a suggestion — the user can pick any icon. Unknown names get a neutral book.
 */
const ICON_HINTS: Array<[RegExp, (typeof AREA_ICONS)[number]]> = [
  [/phys|mechanic|electr|optic|quantum/i, "atom"],
  [/chem|organic|lab\b/i, "flask-conical"],
  [/bio|botan|zoolog|genetic|anatom|physiol/i, "dna"],
  [/neet|mbbs|medic|nursing|pharma|usmle|aiims|clinic/i, "stethoscope"],
  [/\blaw\b|legal|clat|judiciary|\bllb\b|bar exam/i, "scale"],
  [/upsc|ias|psc|polity|histor|civics|geograph|social|gov|ssc|current affairs/i, "landmark"],
  [/math|algebra|calculus|statistic|quant|aptitude|geometry/i, "sigma"],
  [/account|commerce|financ|econom|\bca\b|cfa|cma|bank|tax/i, "calculator"],
  [/english|hindi|spanish|french|german|japanese|korean|chinese|sanskrit|urdu|language|ielts|toefl|grammar|vocab/i, "languages"],
  [/code|coding|program|python|java|dsa|algorithm|web|software|develop|data struct|sql|computer|cs\b|gate/i, "code"],
  [/design|draw|art|paint|sketch|ui\b|ux\b|illustrat/i, "palette"],
  [/music|guitar|piano|sing|vocal|violin|drum|tabla|sitar/i, "music"],
  [/gym|fitness|workout|yoga|sport|run/i, "dumbbell"],
  [/business|market|manage|\bmba\b|\bcat\b|gmat|career|interview|job|work|project|startup/i, "briefcase"],
  [/writ|essay|journal|poem|blog|literat/i, "pen-tool"],
  [/research|thesis|psycholog|philosoph|neuro/i, "brain"],
  [/exam|test|jee|gre|sat\b|olympiad|mock|revision|board/i, "target"],
  [/geo|world|travel|international/i, "globe"],
  [/school|college|degree|semester|class|course|universit/i, "graduation-cap"],
];
export function guessIcon(name: string): (typeof AREA_ICONS)[number] {
  for (const [re, icon] of ICON_HINTS) if (re.test(name)) return icon;
  return "book-open";
}

export const RESOURCE_TYPES = [
  "COURSE",
  "YOUTUBE",
  "DOCUMENTATION",
  "WEBSITE",
  "BOOK",
  "NOTES",
  "OTHER",
] as const;

export const RESOURCE_LABEL: Record<(typeof RESOURCE_TYPES)[number], string> = {
  COURSE: "Course",
  YOUTUBE: "YouTube",
  DOCUMENTATION: "Documentation",
  WEBSITE: "Website",
  BOOK: "Book",
  NOTES: "Notes",
  OTHER: "Other",
};
