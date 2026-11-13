import { NextResponse, type NextRequest } from "next/server";

/** Clears the old sample-workspace cookie. */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin));
  res.cookies.delete("veil_demo");
  return res;
}
