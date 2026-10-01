import { z } from "zod";
import { authed } from "@/lib/api";
import { yearAnalytics } from "@/server/analytics";

export const dynamic = "force-dynamic";
export const GET = authed(async ({ user, url }) => {
  const y = url.searchParams.get("year");
  return yearAnalytics(user, y ? z.coerce.number().int().min(2000).max(2100).parse(y) : undefined);
});
