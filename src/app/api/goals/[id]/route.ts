import { authed } from "@/lib/api";
import { deleteGoal } from "@/server/goals";

export const DELETE = authed(async ({ user, params }) => {
  await deleteGoal(user, params.id!);
  return { ok: true };
});
