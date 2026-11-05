import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, updateSession } from "@/lib/supabase/proxy";

/**
 * Route protection.
 *
 * - /dashboard/** requires either a verified Supabase session or an explicit
 *   demo session (cookie set by /demo). When Supabase is not configured at
 *   all, the dashboard is reachable and runs entirely in demo mode.
 * - Signed-in users visiting /login or /signup are sent to the dashboard.
 *
 * API routes perform their own authorisation checks; this proxy is a UX
 * layer, not the security boundary.
 */
export async function proxy(request: NextRequest) {
  const { response, userId, configured } = await updateSession(request);
  const { pathname } = request.nextUrl;
  const isDemo = request.cookies.get(DEMO_COOKIE)?.value === "1";

  if (pathname.startsWith("/dashboard") && configured && !userId && !isDemo) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if ((pathname === "/login" || pathname === "/signup") && userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup", "/auth/:path*", "/api/:path*"],
};
