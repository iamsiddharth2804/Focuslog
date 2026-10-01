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
  "code",
  "brain",
  "pen-tool",
  "calculator",
  "flask-conical",
  "globe",
  "languages",
  "music",
  "palette",
  "briefcase",
  "graduation-cap",
] as const;

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
