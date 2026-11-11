import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, clientIp, HttpError, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { MAX_PROOF_TOKEN, readProofToken } from "@/lib/near-ai/proof";
import { reattestSigner } from "@/lib/near-ai/verify";

export const maxDuration = 60;

const bodySchema = z.object({ token: z.string().min(10).max(MAX_PROOF_TOKEN) });

/** Public: fresh attestation for the signing key inside a VEIL-issued proof. */
export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const limited = limitOrNull(`proof-attest:${clientIp(req)}`, RATE_LIMITS.attestation);
  if (limited) return limited;
  try {
    const parsed = bodySchema.safeParse(await readJson(req, 16 * 1024));
    if (!parsed.success) return jsonError(400, "Invalid proof.");
    const proof = readProofToken(parsed.data.token);
    if (!proof) return jsonError(400, "This proof link isn't valid.");
    return jsonOk(await reattestSigner(proof.model, proof.signature.signingAddress, proof.signature.algo));
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.message);
    return jsonError(502, "The check could not run right now.");
  }
}
