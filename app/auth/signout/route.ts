import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_COOKIE } from "@/lib/supabase/proxy";
import { assertSameOrigin } from "@/lib/security/http";

export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin), { status: 303 });
  res.cookies.delete(DEMO_COOKIE);
  return res;
}
