import { clickSchema } from "@/lib/validation";
import { authed } from "@/lib/api";
import { getTrackerState, pauseDay } from "@/server/tracking";

export const POST = authed(async ({ user, body }) => {
  await pauseDay(user, clickSchema.parse(body).at);
  return getTrackerState(user, { finalize: false });
});
