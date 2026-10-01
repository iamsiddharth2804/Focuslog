import { authed } from "@/lib/api";
import { toPublicUser } from "@/lib/auth/session";
import { settingsSchema } from "@/lib/validation";
import { getSettings, updateSettings } from "@/server/account";

export const GET = authed(async ({ user }) => ({ user: toPublicUser(user), settings: await getSettings(user) }));
export const PATCH = authed(async ({ user, body }) => {
  const u = await updateSettings(user, settingsSchema.parse(body));
  return { user: toPublicUser(u), settings: await getSettings(u) };
});
