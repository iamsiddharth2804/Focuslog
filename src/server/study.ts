import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { activitySessions, resources, studyAreas, subtasks, tasks, type User } from "@/db/schema";
import { notFound } from "@/lib/api";
import type {
  resourceSchema,
  studyAreaPatchSchema,
  studyAreaSchema,
  subtaskPatchSchema,
  subtaskSchema,
  taskPatchSchema,
  taskSchema,
} from "@/lib/validation";
import { setGoal, clearGoal } from "./goals";

/* Every query is scoped by user_id. Nothing here can read another user's rows. */

/** Completed focus seconds grouped by key (open activities are counted by the live tracker). */
async function focusSecondsBy(userId: string, column: typeof activitySessions.studyAreaId | typeof activitySessions.taskId) {
  const rows = await db
    .select({ key: column, seconds: sql<number>`coalesce(sum(${activitySessions.durationSeconds}), 0)::int` })
    .from(activitySessions)
    .where(and(eq(activitySessions.userId, userId), eq(activitySessions.type, "FOCUS"), isNotNull(column)))
    .groupBy(column);
  return new Map(rows.map((r) => [r.key as string, Number(r.seconds)]));
}

export async function listStudyAreas(user: User, opts: { includeArchived?: boolean } = {}) {
  const areas = await db
    .select()
    .from(studyAreas)
    .where(and(eq(studyAreas.userId, user.id), opts.includeArchived ? undefined : isNull(studyAreas.archivedAt)))
    .orderBy(asc(studyAreas.createdAt));
  const secs = await focusSecondsBy(user.id, activitySessions.studyAreaId);
  const counts = await db
    .select({
      areaId: tasks.studyAreaId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'DONE')::int`,
    })
    .from(tasks)
    .where(eq(tasks.userId, user.id))
    .groupBy(tasks.studyAreaId);
  const cmap = new Map(counts.map((c) => [c.areaId, c]));
  return areas.map((a) => ({
    ...a,
    totalSeconds: secs.get(a.id) ?? 0,
    taskCount: Number(cmap.get(a.id)?.total ?? 0),
    tasksDone: Number(cmap.get(a.id)?.done ?? 0),
  }));
}

export async function getStudyArea(user: User, id: string) {
  const [area] = await db
    .select()
    .from(studyAreas)
    .where(and(eq(studyAreas.id, id), eq(studyAreas.userId, user.id)));
  if (!area) throw notFound("Study area");
  const [taskRows, resourceRows, areaSecs, taskSecs] = await Promise.all([
    db.query.tasks.findMany({
      where: and(eq(tasks.studyAreaId, id), eq(tasks.userId, user.id)),
      with: { subtasks: { orderBy: [asc(subtasks.position), asc(subtasks.createdAt)] } },
      orderBy: [asc(tasks.position), desc(tasks.createdAt)],
    }),
    db
      .select()
      .from(resources)
      .where(and(eq(resources.studyAreaId, id), eq(resources.userId, user.id)))
      .orderBy(asc(resources.createdAt)),
    focusSecondsBy(user.id, activitySessions.studyAreaId),
    focusSecondsBy(user.id, activitySessions.taskId),
  ]);
  return {
    ...area,
    totalSeconds: areaSecs.get(id) ?? 0,
    tasks: taskRows.map((t) => ({ ...t, actualSeconds: taskSecs.get(t.id) ?? 0 })),
    resources: resourceRows,
  };
}

export async function createStudyArea(user: User, input: z.infer<typeof studyAreaSchema>) {
  const [area] = await db
    .insert(studyAreas)
    .values({
      userId: user.id,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? "book-open",
      color: input.color ?? "#2E5E4E",
    })
    .returning();
  if (input.weeklyGoalMinutes) await setGoal(user, { type: "SUBJECT_WEEKLY", studyAreaId: area!.id, targetMinutes: input.weeklyGoalMinutes });
  return area!;
}

export async function updateStudyArea(user: User, id: string, input: z.infer<typeof studyAreaPatchSchema>) {
  const { weeklyGoalMinutes, archived, ...rest } = input;
  const [area] = await db
    .update(studyAreas)
    .set({
      ...rest,
      ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
    })
    .where(and(eq(studyAreas.id, id), eq(studyAreas.userId, user.id)))
    .returning();
  if (!area) throw notFound("Study area");
  if (weeklyGoalMinutes !== undefined) {
    if (weeklyGoalMinutes) await setGoal(user, { type: "SUBJECT_WEEKLY", studyAreaId: id, targetMinutes: weeklyGoalMinutes });
    else await clearGoal(user, { type: "SUBJECT_WEEKLY", studyAreaId: id });
  }
  return area;
}

/** Deleting an area keeps its recorded time (activities keep their rows with study_area_id = null). */
export async function deleteStudyArea(user: User, id: string) {
  const res = await db
    .delete(studyAreas)
    .where(and(eq(studyAreas.id, id), eq(studyAreas.userId, user.id)))
    .returning({ id: studyAreas.id });
  if (!res.length) throw notFound("Study area");
}

/* ───────── Tasks ───────── */

export async function listTasks(user: User, filter: { studyAreaId?: string; status?: string } = {}) {
  const rows = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, user.id),
      filter.studyAreaId ? eq(tasks.studyAreaId, filter.studyAreaId) : undefined,
      filter.status === "open" ? sql`${tasks.status} <> 'DONE'` : undefined,
    ),
    with: { subtasks: { orderBy: [asc(subtasks.position), asc(subtasks.createdAt)] }, studyArea: { columns: { name: true, color: true } } },
    orderBy: [asc(tasks.position), desc(tasks.createdAt)],
  });
  const secs = await focusSecondsBy(user.id, activitySessions.taskId);
  return rows.map((t) => ({ ...t, actualSeconds: secs.get(t.id) ?? 0 }));
}

async function assertArea(user: User, studyAreaId: string) {
  const [a] = await db
    .select({ id: studyAreas.id })
    .from(studyAreas)
    .where(and(eq(studyAreas.id, studyAreaId), eq(studyAreas.userId, user.id)));
  if (!a) throw notFound("Study area");
}

async function assertTask(user: User, taskId: string) {
  const [t] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)));
  if (!t) throw notFound("Task");
  return t;
}

export async function createTask(user: User, input: z.infer<typeof taskSchema>) {
  await assertArea(user, input.studyAreaId);
  const [{ max }] = (await db
    .select({ max: sql<number>`coalesce(max(${tasks.position}), 0)::int` })
    .from(tasks)
    .where(eq(tasks.studyAreaId, input.studyAreaId))) as [{ max: number }];
  const status = input.status ?? "TODO";
  const [task] = await db
    .insert(tasks)
    .values({
      userId: user.id,
      studyAreaId: input.studyAreaId,
      name: input.name,
      description: input.description ?? null,
      status,
      priority: input.priority ?? "MEDIUM",
      estimatedMinutes: input.estimatedMinutes ?? null,
      dueDate: input.dueDate ?? null,
      position: Number(max) + 1,
      completedAt: status === "DONE" ? new Date() : null,
    })
    .returning();
  return { ...task!, subtasks: [], actualSeconds: 0 };
}

export async function updateTask(user: User, id: string, input: z.infer<typeof taskPatchSchema>) {
  const current = await assertTask(user, id);
  const completedAt =
    input.status === undefined ? undefined : input.status === "DONE" ? (current.completedAt ?? new Date()) : null;
  const [task] = await db
    .update(tasks)
    .set({ ...input, ...(completedAt === undefined ? {} : { completedAt }) })
    .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)))
    .returning();
  return task!;
}

export async function deleteTask(user: User, id: string) {
  const res = await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, user.id))).returning({ id: tasks.id });
  if (!res.length) throw notFound("Task");
}

/* ───────── Subtasks ───────── */

export async function createSubtask(user: User, input: z.infer<typeof subtaskSchema>) {
  await assertTask(user, input.taskId);
  const [{ max }] = (await db
    .select({ max: sql<number>`coalesce(max(${subtasks.position}), 0)::int` })
    .from(subtasks)
    .where(eq(subtasks.taskId, input.taskId))) as [{ max: number }];
  const [row] = await db
    .insert(subtasks)
    .values({ userId: user.id, taskId: input.taskId, name: input.name, position: Number(max) + 1 })
    .returning();
  return row!;
}

export async function updateSubtask(user: User, id: string, input: z.infer<typeof subtaskPatchSchema>) {
  const [row] = await db
    .update(subtasks)
    .set({
      ...input,
      ...(input.completed === undefined ? {} : { completedAt: input.completed ? new Date() : null }),
    })
    .where(and(eq(subtasks.id, id), eq(subtasks.userId, user.id)))
    .returning();
  if (!row) throw notFound("Subtask");
  return row;
}

export async function deleteSubtask(user: User, id: string) {
  const res = await db
    .delete(subtasks)
    .where(and(eq(subtasks.id, id), eq(subtasks.userId, user.id)))
    .returning({ id: subtasks.id });
  if (!res.length) throw notFound("Subtask");
}

/* ───────── Resources ───────── */

export async function createResource(user: User, input: z.infer<typeof resourceSchema>) {
  await assertArea(user, input.studyAreaId);
  if (input.taskId) await assertTask(user, input.taskId);
  const [row] = await db
    .insert(resources)
    .values({
      userId: user.id,
      studyAreaId: input.studyAreaId,
      taskId: input.taskId ?? null,
      title: input.title,
      url: input.url ?? null,
      type: input.type ?? "WEBSITE",
      description: input.description ?? null,
    })
    .returning();
  return row!;
}

export async function updateResource(user: User, id: string, input: Partial<z.infer<typeof resourceSchema>>) {
  const { studyAreaId: _ignored, ...rest } = input;
  if (rest.taskId) await assertTask(user, rest.taskId);
  const [row] = await db
    .update(resources)
    .set(rest)
    .where(and(eq(resources.id, id), eq(resources.userId, user.id)))
    .returning();
  if (!row) throw notFound("Resource");
  return row;
}

export async function deleteResource(user: User, id: string) {
  const res = await db
    .delete(resources)
    .where(and(eq(resources.id, id), eq(resources.userId, user.id)))
    .returning({ id: resources.id });
  if (!res.length) throw notFound("Resource");
}

export async function areaNames(userId: string, ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; color: string }>();
  const rows = await db
    .select({ id: studyAreas.id, name: studyAreas.name, color: studyAreas.color })
    .from(studyAreas)
    .where(and(eq(studyAreas.userId, userId), inArray(studyAreas.id, ids)));
  return new Map(rows.map((r) => [r.id, { name: r.name, color: r.color }]));
}
