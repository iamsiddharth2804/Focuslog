import { generateCodeVerifier, generateState } from "arctic";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { googleClient, googleEnabled } from "@/lib/auth/google";

export async function GET() {
  if (!googleEnabled()) return NextResponse.redirect(new URL("/login?error=google_disabled", process.env.APP_URL ?? "http://localhost:3000"));
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = googleClient().createAuthorizationURL(state, verifier, ["openid", "profile", "email"]);
  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 };
  jar.set("g_state", state, opts);
  jar.set("g_verifier", verifier, opts);
  return NextResponse.redirect(url);
}
