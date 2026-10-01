import { authed } from "@/lib/api";
import { activityIdSchema } from "@/lib/validation";
import { getTrackerState, resumeActivity } from "@/server/tracking";

export const POST = authed(async ({ user, body }) => {
  const { activityId, at } = activityIdSchema.parse(body);
  await resumeActivity(user, activityId, at);
  return getTrackerState(user, { finalize: false });
});
