import type { NextRequest } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/session";
import { deleteConversation, getMessages } from "@/lib/supabase/repo";
import { assertSameOrigin, jsonError, jsonOk } from "@/lib/security/http";

export async function GET(_req: NextRequest, ctxParams: RouteContext<"/api/ai/conversations/[id]">) {
  const { id } = await ctxParams.params;
  if (!z.uuid().safeParse(id).success) return jsonError(400, "Invalid conversation id.");
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonError(401, "Sign in to load conversations.");
  try {
    return jsonOk({ messages: await getMessages(ctx.supabase, ctx.user.id, id) });
  } catch {
    return jsonError(500, "Could not load messages.");
  }
}

export async function DELETE(req: NextRequest, ctxParams: RouteContext<"/api/ai/conversations/[id]">) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const { id } = await ctxParams.params;
  if (!z.uuid().safeParse(id).success) return jsonError(400, "Invalid conversation id.");
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonError(401, "Sign in to manage conversations.");
  try {
    await deleteConversation(ctx.supabase, ctx.user.id, id);
    return jsonOk({ ok: true });
  } catch {
    return jsonError(500, "Could not delete conversation.");
  }
}
