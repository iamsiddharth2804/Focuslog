import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { authSessions, users, type User } from "@/db/schema";

export const SESSION_COOKIE = "fl_session";
const LONG_MS = 30 * 24 * 60 * 60 * 1000;
const SHORT_MS = 24 * 60 * 60 * 1000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export async function createSession(userId: string, remember = true) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + (remember ? LONG_MS : SHORT_MS));
  await db.insert(authSessions).values({ id: hashToken(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { expires: expiresAt } : {}),
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    userCache.delete(hashToken(token));
    await db.delete(authSessions).where(eq(authSessions.id, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/*
 * Every request needs "who is this?" — one database round trip. A tiny in-process cache
 * (15 s) removes it from rapid back-to-back clicks. Anything that changes a user or ends a
 * session calls `invalidateUser`, so changes still take effect immediately.
 */
const USER_TTL_MS = 15_000;
const userCache = new Map<string, { user: User; until: number }>();

export function invalidateUser(userId: string) {
  for (const [k, v] of userCache) if (v.user.id === userId) userCache.delete(k);
}

/** Current user or null. Cached per request, and briefly across requests. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const key = hashToken(token);
  const hit = userCache.get(key);
  if (hit && hit.until > Date.now()) return hit.user;
  userCache.delete(key);
  const rows = await db
    .select({ user: users, expiresAt: authSessions.expiresAt })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.id, key), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (userCache.size > 5000) userCache.clear();
  userCache.set(key, { user: row.user, until: Math.min(Date.now() + USER_TTL_MS, row.expiresAt.getTime()) });
  return row.user;
});

export type PublicUser = Omit<User, "passwordHash" | "googleId"> & { hasPassword: boolean; hasGoogle: boolean };
export function toPublicUser(u: User): PublicUser {
  const { passwordHash, googleId, ...rest } = u;
  return { ...rest, hasPassword: !!passwordHash, hasGoogle: !!googleId };
}
