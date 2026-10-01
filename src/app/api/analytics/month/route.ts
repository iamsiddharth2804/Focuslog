import { z } from "zod";
import { authed } from "@/lib/api";
import { monthAnalytics } from "@/server/analytics";

export const dynamic = "force-dynamic";
export const GET = authed(async ({ user, url }) => {
  const m = url.searchParams.get("month");
  return monthAnalytics(user, m ? z.string().regex(/^\d{4}-\d{2}$/).parse(m) : undefined);
});
