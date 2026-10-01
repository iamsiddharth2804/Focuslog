import { authed } from "@/lib/api";
import { dateKey } from "@/lib/validation";
import { weekAnalytics } from "@/server/analytics";

export const dynamic = "force-dynamic";
export const GET = authed(async ({ user, url }) => {
  const d = url.searchParams.get("date");
  return weekAnalytics(user, d ? dateKey.parse(d) : undefined);
});
