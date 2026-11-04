import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/supabase/proxy";

/** Starts a no-account demo session (sample data only). */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
  res.cookies.set(DEMO_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24, path: "/" });
  return res;
}
