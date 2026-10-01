import { z } from "zod";
import { authed } from "@/lib/api";
import { endDay } from "@/server/tracking";

export const POST = authed(async ({ user, body }) => {
  const { endAtLastActivity } = z.object({ endAtLastActivity: z.boolean().optional() }).parse(body);
  const day = await endDay(user, { endAtLastActivity });
  return { ok: true, dailySessionId: day.id, date: day.date };
});
