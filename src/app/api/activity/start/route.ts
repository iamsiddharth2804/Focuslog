import { authed } from "@/lib/api";
import { startActivitySchema } from "@/lib/validation";
import { getTrackerState, startActivity } from "@/server/tracking";

export const POST = authed(async ({ user, body }) => {
  await startActivity(user, startActivitySchema.parse(body));
  return getTrackerState(user, { finalize: false });
});
