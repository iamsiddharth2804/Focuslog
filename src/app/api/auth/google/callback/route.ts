import { decodeIdToken } from "arctic";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { googleClient } from "@/lib/auth/google";
import { createSession } from "@/lib/auth/session";

type Claims = { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };

export async function GET(req: Request) {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const url = new URL(req.url);
  const jar = await cookies();
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const verifier = jar.get("g_verifier")?.value;
  if (!code || !state || state !== jar.get("g_state")?.value || !verifier) {
    return NextResponse.redirect(new URL("/login?error=google_state", base));
  }
  try {
    const tokens = await googleClient().validateAuthorizationCode(code, verifier);
    const claims = decodeIdToken(tokens.idToken()) as Claims;
    if (!claims.email || claims.email_verified === false) return NextResponse.redirect(new URL("/login?error=google_email", base));
    const email = claims.email.toLowerCase();

    let [user] = await db.select().from(users).where(eq(users.googleId, claims.sub));
    if (!user) {
      // Link to an existing email account (Google verified the address).
      [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
      if (user) {
        [user] = await db
          .update(users)
          .set({ googleId: claims.sub, avatarUrl: user.avatarUrl ?? claims.picture ?? null })
          .where(eq(users.id, user.id))
          .returning();
      } else {
        [user] = await db
          .insert(users)
          .values({ name: claims.name ?? email.split("@")[0]!, email, googleId: claims.sub, avatarUrl: claims.picture ?? null })
          .returning();
      }
    }
    jar.delete("g_state");
    jar.delete("g_verifier");
    await createSession(user!.id, true);
    return NextResponse.redirect(new URL(user!.onboardedAt ? "/dashboard" : "/onboarding", base));
  } catch (e) {
    console.error("[auth] google callback failed", e);
    return NextResponse.redirect(new URL("/login?error=google_failed", base));
  }
}
