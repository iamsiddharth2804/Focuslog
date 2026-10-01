import { authed } from "@/lib/api";
import { localDateKey } from "@/lib/time";
import { exportActivitiesCsv } from "@/server/account";

export const dynamic = "force-dynamic";
export const GET = authed(async ({ user }) => {
  const csv = await exportActivitiesCsv(user);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="focuslog-${localDateKey(new Date(), user.timezone)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
