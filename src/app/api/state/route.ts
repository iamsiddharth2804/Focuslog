import { authed } from "@/lib/api";
import { getTrackerState } from "@/server/tracking";

export const dynamic = "force-dynamic";
export const GET = authed(async ({ user }) => getTrackerState(user));
