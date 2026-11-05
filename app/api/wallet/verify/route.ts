import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getRequestContext } from "@/lib/session";
import { verifyToken } from "@/lib/security/crypto";
import { assertSameOrigin, HttpError, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { firstIssue, ownershipProofSchema } from "@/lib/security/validation";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { verifyNep413Signature } from "@/lib/near/nep413";
import { viewAccessKey } from "@/lib/near/rpc";
import { addWallet } from "@/lib/supabase/repo";
import { CHALLENGE_COOKIE, NEP413_RECIPIENT } from "@/lib/near/challenge";

/**
 * Verifies a NEP-413 signed message and, if valid, tracks the wallet as
 * ownership-verified. Checks:
 *  1. challenge cookie is authentic, unexpired and issued to this user
 *  2. ed25519 signature over the NEP-413 payload is valid
 *  3. the public key is a FullAccess key on the claimed account (RPC)
 */
export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonError(401, "Sign in to verify wallet ownership.");
  const limited = limitOrNull(`mut:${ctx.user.id}`, RATE_LIMITS.mutations);
  if (limited) return limited;

  const store = await cookies();
  const challenge = verifyToken<{ n: string; m: string; u: string }>(store.get(CHALLENGE_COOKIE)?.value);
  store.delete({ name: CHALLENGE_COOKIE, path: "/api/wallet" }); // single use
  if (!challenge || challenge.u !== ctx.user.id) return jsonError(400, "Verification challenge expired. Please try again.");

  try {
    const parsed = ownershipProofSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, firstIssue(parsed.error));
    const { accountId, publicKey, signature, label } = parsed.data;

    const ok = verifyNep413Signature({
      message: challenge.m,
      nonce: new Uint8Array(Buffer.from(challenge.n, "base64")),
      recipient: NEP413_RECIPIENT,
      publicKey,
      signature,
    });
    if (!ok) return jsonError(400, "Signature verification failed.");

    const key = await viewAccessKey(accountId, publicKey);
    if (!key) return jsonError(400, "The signing key is not registered on that account.");
    if (key.permission !== "FullAccess") return jsonError(400, "Ownership proofs require a full-access key (NEP-413).");

    await addWallet(ctx.supabase, ctx.user.id, accountId, label ?? null, { publicKey });
    return jsonOk({ ok: true, accountId, verified: true });
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.message);
    return jsonError(502, "Could not verify ownership right now.");
  }
}
