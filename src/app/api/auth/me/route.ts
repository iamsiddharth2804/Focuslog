import { authed } from "@/lib/api";
import { toPublicUser } from "@/lib/auth/session";
import { getSettings } from "@/server/account";

export const GET = authed(async ({ user }) => ({ user: toPublicUser(user), settings: await getSettings(user) }));
