import { authed } from "@/lib/api";
import { endActivitySchema } from "@/lib/validation";
import { endActivity, getTrackerState } from "@/server/tracking";

export const POST = authed(async ({ user, body }) => {
  const result = await endActivity(user, endActivitySchema.parse(body));
  const state = await getTrackerState(user, { finalize: false });
  return { ...state, ended: { id: result.ended.id, type: result.ended.type, durationSeconds: result.ended.durationSeconds, endReason: result.ended.endReason } };
});
