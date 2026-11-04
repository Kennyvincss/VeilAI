import type { NextRequest } from "next/server";
import { getRequestContext } from "@/lib/session";
import { verifyModelAttestation } from "@/lib/near-ai/verify";
import { logProcessing } from "@/lib/supabase/repo";
import { assertSameOrigin, clientIp, jsonError, jsonOk, limitOrNull } from "@/lib/security/http";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

export const maxDuration = 60;

/** Runs a full gateway + model attestation verification with a fresh nonce. */
export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ctx = await getRequestContext();
  if (!ctx.user && !ctx.demo) return jsonError(401, "Sign in or start a demo session.");
  const limited = limitOrNull(`attest:${ctx.user?.id ?? clientIp(req)}`, RATE_LIMITS.attestation);
  if (limited) return limited;
  const result = await verifyModelAttestation();
  if (ctx.user && ctx.supabase && result.state !== "not-connected") {
    await logProcessing(ctx.supabase, ctx.user.id, "attestation", result).catch(() => undefined);
  }
  return jsonOk(result);
}
