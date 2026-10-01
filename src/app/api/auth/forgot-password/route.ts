import { sql } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { publicRoute } from "@/lib/api";
import { hashToken, newToken } from "@/lib/auth/session";
import { z } from "zod";

export const POST = publicRoute(async ({ body }) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(body);
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
  if (user) {
    const token = newToken();
    await db.insert(passwordResetTokens).values({
      id: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const link = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
    // V1 has no email provider configured. Plug one in here (Resend, SES, …).
    console.info(`[auth] Password reset link for ${email}: ${link}`);
  }
  // Same response either way so emails can't be enumerated.
  return { ok: true };
});
