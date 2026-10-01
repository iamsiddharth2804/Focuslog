import { authed } from "@/lib/api";
import { goalSchema } from "@/lib/validation";
import { goalsOverview, setGoal } from "@/server/goals";

export const dynamic = "force-dynamic";
export const GET = authed(async ({ user }) => goalsOverview(user));
export const POST = authed(async ({ user, body }) => setGoal(user, goalSchema.parse(body)));
