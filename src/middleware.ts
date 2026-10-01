import { NextResponse, type NextRequest } from "next/server";

const APP = ["/dashboard", "/study", "/timer", "/analytics", "/calendar", "/goals", "/settings", "/onboarding", "/summary"];

/**
 * Cheap cookie-presence gate for app pages. Real verification happens server-side on every
 * request. (Login/register are never redirected here: an expired cookie would otherwise
 * bounce between /login and /dashboard forever.)
 */
export function middleware(req: NextRequest) {
  const has = req.cookies.has("fl_session");
  const { pathname } = req.nextUrl;
  if (!has && APP.some((p) => pathname.startsWith(p))) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next|favicon|.*\\..*).*)"] };
