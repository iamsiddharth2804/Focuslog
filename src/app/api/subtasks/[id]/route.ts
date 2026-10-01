import { authed } from "@/lib/api";
import { subtaskPatchSchema } from "@/lib/validation";
import { deleteSubtask, updateSubtask } from "@/server/study";

export const PATCH = authed(async ({ user, params, body }) => updateSubtask(user, params.id!, subtaskPatchSchema.parse(body)));
export const DELETE = authed(async ({ user, params }) => {
  await deleteSubtask(user, params.id!);
  return { ok: true };
});
