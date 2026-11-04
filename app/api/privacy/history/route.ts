import type { NextRequest } from "next/server";
import { getRequestContext } from "@/lib/session";
import { clearProcessing, listProcessing } from "@/lib/supabase/repo";
import { assertSameOrigin, jsonError, jsonOk } from "@/lib/security/http";

export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonOk({ entries: [], persisted: false });
  try {
    return jsonOk({ entries: await listProcessing(ctx.supabase, ctx.user.id), persisted: true });
  } catch {
    return jsonError(500, "Could not load processing history.");
  }
}

export async function DELETE(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonError(401, "Sign in to manage history.");
  await clearProcessing(ctx.supabase, ctx.user.id);
  return jsonOk({ ok: true });
}
