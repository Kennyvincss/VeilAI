import type { NextRequest } from "next/server";
import { assertSameOrigin, clientIp, HttpError, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { firstIssue } from "@/lib/security/validation";
import { prepareSend } from "@/lib/defi/service";
import { defiErrorResponse, sendSchema } from "@/lib/defi/http";

/**
 * Validates a transfer against live chain state and returns the plan for
 * the user's wallet to sign. Nothing is signed or sent by the server.
 */
export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const limited = limitOrNull(`defi-send:${clientIp(req)}`, { limit: 30, windowMs: 5 * 60_000 });
  if (limited) return limited;
  try {
    const parsed = sendSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, firstIssue(parsed.error));
    return jsonOk(await prepareSend(parsed.data));
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.message);
    return defiErrorResponse(err, "defi.send_failed");
  }
}
