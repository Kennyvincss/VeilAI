import { NextResponse, type NextRequest } from "next/server";

/** The sample workspace was removed; old links go to sign-up. */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/signup", req.nextUrl.origin));
  res.cookies.delete("veil_demo");
  return res;
}
