import type { NextRequest } from "next/server";
import { z } from "zod";
import { ed25519 } from "@noble/curves/ed25519.js";
import { getRequestContext } from "@/lib/session";
import { assertSameOrigin, clientIp, HttpError, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { nearNetwork } from "@/lib/env";
import { viewAccount } from "@/lib/near/rpc";
import { decodeEd25519PublicKey, decodeSignature } from "@/lib/near/nep413";
import { creationMessage, newAccountNameProblem, topLevelFor } from "@/lib/username-rules";
import { createNamedAccount, finishSlot, reserveSlot, sponsoredAccountsEnabled, SponsorError } from "@/lib/near/sponsor";
import { addWallet, getProfile, setPayoutAccount, setUsername } from "@/lib/supabase/repo";
import { log } from "@/lib/security/logger";

export const maxDuration = 60;

const bodySchema = z.object({
  name: z.string().trim().toLowerCase().max(20),
  publicKey: z.string().regex(/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/, "Invalid public key"),
  signature: z.string().min(40).max(200),
});

/**
 * Creates name.near (or name.testnet) for the signed-in user with a PUBLIC
 * key generated in their browser. The browser proves it holds the private
 * key by signing a message that binds the name and key. VEIL never sees the
 * private key or recovery phrase. One account per VEIL user; daily cap.
 */
export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonError(401, "Create a free VEIL account first.");
  if (!sponsoredAccountsEnabled()) return jsonError(503, "Creating NEAR accounts isn't available right now.");
  const limited = limitOrNull(`near-create-ip:${clientIp(req)}`, { limit: 5, windowMs: 24 * 3_600_000 }) ?? limitOrNull(`near-create-user:${ctx.user.id}`, { limit: 5, windowMs: 24 * 3_600_000 });
  if (limited) return limited;

  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await readJson(req, 4 * 1024));
    if (!parsed.success) return jsonError(400, "Invalid request.");
    body = parsed.data;
  } catch (err) {
    return jsonError(err instanceof HttpError ? err.status : 400, "Invalid request.");
  }

  const problem = newAccountNameProblem(body.name);
  if (problem) return jsonError(400, problem);
  const accountId = `${body.name}.${topLevelFor(nearNetwork())}`;

  // Proof that the browser holds the private key for this public key.
  let validProof = false;
  try {
    validProof = ed25519.verify(decodeSignature(body.signature), new TextEncoder().encode(creationMessage(accountId, body.publicKey)), decodeEd25519PublicKey(body.publicKey));
  } catch {
    validProof = false;
  }
  if (!validProof) return jsonError(400, "Key proof failed. Please start again.");

  const existing = await viewAccount(accountId).catch(() => undefined);
  if (existing === undefined) return jsonError(502, "Couldn't reach the NEAR network. Please try again.");
  if (existing !== null) return jsonError(409, `${accountId} is already taken.`);

  try {
    await reserveSlot(ctx.user.id, accountId, body.publicKey);
  } catch (err) {
    if (err instanceof SponsorError) return jsonError(err.status, err.message);
    throw err;
  }

  let txHash: string | null = null;
  try {
    ({ txHash } = await createNamedAccount(accountId, body.publicKey));
  } catch (err) {
    await finishSlot(ctx.user.id, "failed", null);
    if (err instanceof SponsorError) return jsonError(err.status, err.message);
    return jsonError(502, "The account couldn't be created. Please try again.");
  }
  await finishSlot(ctx.user.id, "created", txHash);
  log("info", "sponsor.account_created", { network: nearNetwork() });

  // Best effort: track it as an ownership-verified wallet, and use it for the username.
  let username: string | null = null;
  try {
    await addWallet(ctx.supabase, ctx.user.id, accountId, "VEIL account", { publicKey: body.publicKey });
    const profile = await getProfile(ctx.supabase, ctx.user.id).catch(() => null);
    if (!profile) await setUsername(ctx.supabase, ctx.user.id, body.name).catch(() => undefined);
    const after = await getProfile(ctx.supabase, ctx.user.id).catch(() => null);
    username = after?.username ?? null;
    if (after && !after.payoutAccount) await setPayoutAccount(ctx.supabase, ctx.user.id, accountId).catch(() => undefined);
  } catch {
    /* the NEAR account exists regardless; these are conveniences */
  }
  return jsonOk({ accountId, txHash, username }, { status: 201 });
}
