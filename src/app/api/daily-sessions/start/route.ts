import { authed } from "@/lib/api";
import { startDaySchema } from "@/lib/validation";
import { getTrackerState, startDay } from "@/server/tracking";

export const POST = authed(async ({ user, body }) => {
  const { label } = startDaySchema.parse(body);
  await startDay(user, label);
  return getTrackerState(user);
});
