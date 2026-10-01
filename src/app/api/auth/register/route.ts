import { db } from "@/db";
import { users } from "@/db/schema";
import { conflict, publicRoute } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { isValidTimeZone } from "@/lib/time";
import { registerSchema } from "@/lib/validation";
import { sql } from "drizzle-orm";

export const POST = publicRoute(async ({ body }) => {
  const input = registerSchema.parse(body);
  const [exists] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`);
  if (exists) throw conflict("EMAIL_TAKEN", "An account with this email already exists. Try signing in.");
  const [user] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      timezone: input.timezone && isValidTimeZone(input.timezone) ? input.timezone : "UTC",
    })
    .returning({ id: users.id });
  await createSession(user!.id, true);
  return { ok: true, next: "/onboarding" };
});
