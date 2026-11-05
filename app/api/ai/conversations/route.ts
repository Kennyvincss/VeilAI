import { getRequestContext } from "@/lib/session";
import { listConversations } from "@/lib/supabase/repo";
import { jsonError, jsonOk } from "@/lib/security/http";

export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonOk({ conversations: [], persisted: false });
  try {
    return jsonOk({ conversations: await listConversations(ctx.supabase, ctx.user.id), persisted: true });
  } catch {
    return jsonError(500, "Could not load conversations.");
  }
}
