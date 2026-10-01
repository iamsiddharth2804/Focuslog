import { authed } from "@/lib/api";
import { getDailySession } from "@/server/account";

export const GET = authed(async ({ user, params }) => getDailySession(user, params.id!));
