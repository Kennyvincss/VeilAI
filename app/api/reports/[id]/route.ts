import type { NextRequest } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/session";
import { deleteReport, getReport } from "@/lib/supabase/repo";
import { assertSameOrigin, jsonError, jsonOk } from "@/lib/security/http";

export async function GET(_req: NextRequest, p: RouteContext<"/api/reports/[id]">) {
  const { id } = await p.params;
  if (!z.uuid().safeParse(id).success) return jsonError(400, "Invalid report id.");
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonError(401, "Sign in to view saved reports.");
  const report = await getReport(ctx.supabase, ctx.user.id, id);
  return report ? jsonOk(report) : jsonError(404, "Report not found.");
}

export async function DELETE(req: NextRequest, p: RouteContext<"/api/reports/[id]">) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const { id } = await p.params;
  if (!z.uuid().safeParse(id).success) return jsonError(400, "Invalid report id.");
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonError(401, "Sign in to manage reports.");
  try {
    await deleteReport(ctx.supabase, ctx.user.id, id);
    return jsonOk({ ok: true });
  } catch {
    return jsonError(500, "Could not delete report.");
  }
}
