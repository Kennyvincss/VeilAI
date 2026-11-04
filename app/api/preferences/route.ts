import type { NextRequest } from "next/server";
import { getRequestContext } from "@/lib/session";
import { DEFAULT_PREFERENCES, deletePreferences, getPreferences, savePreferences } from "@/lib/supabase/repo";
import { assertSameOrigin, HttpError, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { firstIssue, preferencesSchema } from "@/lib/security/validation";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** AI memory: explicit, inspectable, editable and deletable preferences. */
export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonOk({ preferences: DEFAULT_PREFERENCES, saved: false, persisted: false });
  try {
    const p = await getPreferences(ctx.supabase, ctx.user.id);
    return jsonOk({ preferences: p ?? DEFAULT_PREFERENCES, saved: Boolean(p), persisted: true });
  } catch {
    return jsonError(500, "Could not load preferences.");
  }
}

export async function PUT(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonError(401, "Create a free account to save preferences.");
  const limited = limitOrNull(`mut:${ctx.user.id}`, RATE_LIMITS.mutations);
  if (limited) return limited;
  try {
    const parsed = preferencesSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, firstIssue(parsed.error));
    await savePreferences(ctx.supabase, ctx.user.id, parsed.data);
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.message);
    return jsonError(500, "Could not save preferences.");
  }
}

export async function DELETE(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonError(401, "Sign in to manage preferences.");
  try {
    await deletePreferences(ctx.supabase, ctx.user.id);
    return jsonOk({ ok: true });
  } catch {
    return jsonError(500, "Could not delete preferences.");
  }
}
