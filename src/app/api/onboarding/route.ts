import { authed } from "@/lib/api";
import { onboardingSchema } from "@/lib/validation";
import { completeOnboarding } from "@/server/account";

export const POST = authed(async ({ user, body }) => {
  await completeOnboarding(user, onboardingSchema.parse(body));
  return { ok: true };
});
