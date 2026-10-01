import { z } from "zod";
import { authed } from "@/lib/api";
import { dateKey } from "@/lib/validation";
import { dayAnalytics } from "@/server/analytics";

export const dynamic = "force-dynamic";
export const GET = authed(async ({ user, url }) => {
  const d = url.searchParams.get("date");
  const session = url.searchParams.get("session");
  return dayAnalytics(user, d ? dateKey.parse(d) : undefined, session ? z.string().uuid().parse(session) : undefined);
});
