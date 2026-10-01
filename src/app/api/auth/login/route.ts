import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, publicRoute } from "@/lib/api";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation";

export const POST = publicRoute(async ({ body }) => {
  const input = loginSchema.parse(body);
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${input.email}`);
  const ok = user?.passwordHash ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!user || !ok) {
    if (user && !user.passwordHash) throw new ApiError(401, "USE_GOOGLE", "This account uses Google sign-in.");
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  await createSession(user.id, input.remember);
  return { ok: true, next: user.onboardedAt ? "/dashboard" : "/onboarding" };
});
