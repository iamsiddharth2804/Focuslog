import { authed } from "@/lib/api";
import { taskSchema } from "@/lib/validation";
import { createTask, listTasks } from "@/server/study";

export const GET = authed(async ({ user, url }) =>
  listTasks(user, { studyAreaId: url.searchParams.get("studyAreaId") ?? undefined, status: url.searchParams.get("status") ?? undefined }),
);
export const POST = authed(async ({ user, body }) => createTask(user, taskSchema.parse(body)));
