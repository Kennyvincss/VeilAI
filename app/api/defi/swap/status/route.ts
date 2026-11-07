import type { NextRequest } from "next/server";
import { z } from "zod";
import { clientIp, jsonError, jsonOk, limitOrNull } from "@/lib/security/http";
import { executionStatus, explainOneClickError } from "@/lib/defi/oneclick";

/** Swap progress by deposit address (polled by the UI). */
export async function GET(req: NextRequest) {
  const limited = limitOrNull(`defi-status:${clientIp(req)}`, { limit: 120, windowMs: 5 * 60_000 });
  if (limited) return limited;
  const addr = z.string().min(2).max(128).regex(/^[a-zA-Z0-9._-]+$/).safeParse(req.nextUrl.searchParams.get("depositAddress") ?? "");
  if (!addr.success) return jsonError(400, "Invalid deposit address.");
  try {
    const s = await executionStatus(addr.data);
    return jsonOk({ status: s.status, updatedAt: s.updatedAt });
  } catch (err) {
    return jsonError(502, explainOneClickError(err));
  }
}
