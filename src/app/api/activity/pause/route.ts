import { authed } from "@/lib/api";
import { activityIdSchema } from "@/lib/validation";
import { getTrackerState, pauseActivity } from "@/server/tracking";

export const POST = authed(async ({ user, body }) => {
  const { activityId, at } = activityIdSchema.parse(body);
  await pauseActivity(user, activityId, at);
  return getTrackerState(user, { finalize: false });
});
