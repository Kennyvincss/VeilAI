import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/supabase/proxy";

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin));
  res.cookies.delete(DEMO_COOKIE);
  return res;
}
