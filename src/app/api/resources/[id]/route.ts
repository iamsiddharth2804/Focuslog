import { authed } from "@/lib/api";
import { resourceSchema } from "@/lib/validation";
import { deleteResource, updateResource } from "@/server/study";

export const PATCH = authed(async ({ user, params, body }) => updateResource(user, params.id!, resourceSchema.partial().parse(body)));
export const DELETE = authed(async ({ user, params }) => {
  await deleteResource(user, params.id!);
  return { ok: true };
});
