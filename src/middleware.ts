import { NextResponse, type NextRequest } from "next/server";

const APP = ["/dashboard", "/study", "/timer", "/analytics", "/calendar", "/goals", "/settings", "/onboarding", "/summary"];
const AUTH = ["/login", "/register"];

/** Cheap cookie-presence gate. Real verification happens server-side on every request. */
export function middleware(req: NextRequest) {
  const has = req.cookies.has("fl_session");
  const { pathname } = req.nextUrl;
  if (!has && APP.some((p) => pathname.startsWith(p))) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (has && AUTH.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next|favicon|.*\\..*).*)"] };
