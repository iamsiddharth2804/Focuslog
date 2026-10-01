import { invalidateUser } from "@/lib/auth/session";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { authSessions, passwordResetTokens, users } from "@/db/schema";
import { ApiError, publicRoute } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { createSession, hashToken } from "@/lib/auth/session";

export const POST = publicRoute(async ({ body }) => {
  const { token, password } = z.object({ token: z.string().min(10), password: z.string().min(8).max(200) }).parse(body);
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.id, hashToken(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())));
  if (!row) throw new ApiError(400, "INVALID_TOKEN", "This reset link is invalid or has expired. Request a new one.");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, row.userId));
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
    await tx.delete(authSessions).where(eq(authSessions.userId, row.userId));
    invalidateUser(row.userId);
  });
  await createSession(row.userId, true);
  return { ok: true };
});
