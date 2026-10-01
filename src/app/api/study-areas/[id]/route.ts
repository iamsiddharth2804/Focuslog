import { authed } from "@/lib/api";
import { studyAreaPatchSchema } from "@/lib/validation";
import { deleteStudyArea, getStudyArea, updateStudyArea } from "@/server/study";

export const GET = authed(async ({ user, params }) => getStudyArea(user, params.id!));
export const PATCH = authed(async ({ user, params, body }) => updateStudyArea(user, params.id!, studyAreaPatchSchema.parse(body)));
export const DELETE = authed(async ({ user, params }) => {
  await deleteStudyArea(user, params.id!);
  return { ok: true };
});
