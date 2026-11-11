import type { NextRequest } from "next/server";
import { assertSameOrigin, clientIp, HttpError, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { firstIssue } from "@/lib/security/validation";
import { DefiError, prepareSend } from "@/lib/defi/service";
import { resolveUsername, UsernamesUnavailable } from "@/lib/usernames";
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
    let { to } = parsed.data;
    let viaUsername: string | undefined;
    if (to.startsWith("@")) {
      const hit = await resolveUsername(to).catch((err) => {
        if (err instanceof UsernamesUnavailable) throw new DefiError("Sending to usernames isn't available right now. Use a NEAR account instead.", 503);
        throw err;
      });
      if (!hit) throw new DefiError(`No VEIL user ${to} has linked a wallet for receiving.`, 404);
      to = hit.accountId;
      viaUsername = `@${hit.username}`;
    }
    return jsonOk(await prepareSend({ ...parsed.data, to, viaUsername }));
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.message);
    return defiErrorResponse(err, "defi.send_failed");
  }
}
