import { authed } from "@/lib/api";
import { taskPatchSchema } from "@/lib/validation";
import { deleteTask, updateTask } from "@/server/study";

export const PATCH = authed(async ({ user, params, body }) => updateTask(user, params.id!, taskPatchSchema.parse(body)));
export const DELETE = authed(async ({ user, params }) => {
  await deleteTask(user, params.id!);
  return { ok: true };
});
