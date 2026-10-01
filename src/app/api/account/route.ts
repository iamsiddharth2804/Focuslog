import { z } from "zod";
import { cookies } from "next/headers";
import { ApiError, authed } from "@/lib/api";
import { verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { deleteAccount } from "@/server/account";

export const DELETE = authed(async ({ user, body }) => {
  const { confirm, password } = z.object({ confirm: z.literal("DELETE"), password: z.string().optional() }).parse(body);
  if (user.passwordHash && !(password && (await verifyPassword(password, user.passwordHash)))) {
    throw new ApiError(401, "INVALID_PASSWORD", "Password is incorrect.");
  }
  void confirm;
  await deleteAccount(user);
  (await cookies()).delete(SESSION_COOKIE);
  return { ok: true };
});
