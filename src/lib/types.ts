import type { dayAnalytics, monthAnalytics, TimelineEntry, weekAnalytics, yearAnalytics } from "@/server/analytics";
import type { goalsOverview } from "@/server/goals";
import type { getStudyArea, listStudyAreas, listTasks } from "@/server/study";

/* Response types inferred from the server so client and API never drift. Dates arrive as strings. */
type Jsonify<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

export type DayAnalytics = Jsonify<Awaited<ReturnType<typeof dayAnalytics>>>;
export type WeekAnalytics = Jsonify<Awaited<ReturnType<typeof weekAnalytics>>>;
export type MonthAnalytics = Jsonify<Awaited<ReturnType<typeof monthAnalytics>>>;
export type YearAnalytics = Jsonify<Awaited<ReturnType<typeof yearAnalytics>>>;
export type PeriodAnalytics = WeekAnalytics;
export type GoalsOverview = Jsonify<Awaited<ReturnType<typeof goalsOverview>>>;
export type StudyAreaListItem = Jsonify<Awaited<ReturnType<typeof listStudyAreas>>[number]>;
export type StudyAreaDetail = Jsonify<Awaited<ReturnType<typeof getStudyArea>>>;
export type TaskItem = Jsonify<Awaited<ReturnType<typeof listTasks>>[number]>;
export type { TimelineEntry };
