import { clickSchema } from "@/lib/validation";
import { authed } from "@/lib/api";
import { getTrackerState, resumeDay } from "@/server/tracking";

export const POST = authed(async ({ user, body }) => {
  await resumeDay(user, clickSchema.parse(body).at);
  return getTrackerState(user, { finalize: false });
});
