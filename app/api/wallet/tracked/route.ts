import type { NextRequest } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/session";
import { addWallet, listWallets, removeWallet } from "@/lib/supabase/repo";
import { assertSameOrigin, HttpError, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { firstIssue, trackedWalletSchema } from "@/lib/security/validation";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { matchesNetwork } from "@/lib/near/account";
import { nearNetwork } from "@/lib/env";
import { viewAccount } from "@/lib/near/rpc";
import { DEMO_WALLETS } from "@/lib/demo/data";

const MAX_WALLETS = 10;

export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) {
    if (ctx.demo)
      return jsonOk({
        demo: true,
        wallets: DEMO_WALLETS.map((a, i) => ({ id: `demo-${i}`, accountId: a, label: i === 0 ? "Main (sample)" : "Trading (sample)", network: "mainnet", ownershipVerified: false, createdAt: new Date().toISOString() })),
      });
    return jsonError(401, "Sign in to manage wallets.");
  }
  try {
    return jsonOk({ demo: false, wallets: await listWallets(ctx.supabase, ctx.user.id) });
  } catch {
    return jsonError(500, "Could not load wallets.");
  }
}

export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonError(401, "Create a free account to track your own wallets.");
  const limited = limitOrNull(`mut:${ctx.user.id}`, RATE_LIMITS.mutations);
  if (limited) return limited;
  try {
    const parsed = trackedWalletSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, firstIssue(parsed.error));
    const { accountId, label } = parsed.data;
    if (!matchesNetwork(accountId, nearNetwork())) return jsonError(400, `This account does not belong to NEAR ${nearNetwork()}.`);
    const existing = await listWallets(ctx.supabase, ctx.user.id);
    if (existing.length >= MAX_WALLETS && !existing.some((w) => w.accountId === accountId)) {
      return jsonError(400, `You can track up to ${MAX_WALLETS} wallets.`);
    }
    // Confirm the account exists before tracking it (public read-only RPC).
    const acct = await viewAccount(accountId).catch(() => undefined);
    if (acct === null) return jsonError(404, "That account does not exist on NEAR.");
    await addWallet(ctx.supabase, ctx.user.id, accountId, label ?? null);
    return jsonOk({ ok: true, verifiedExists: acct !== undefined }, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.message);
    return jsonError(500, "Could not add wallet.");
  }
}

export async function DELETE(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonError(401, "Sign in to manage wallets.");
  const id = z.uuid().safeParse(req.nextUrl.searchParams.get("id"));
  if (!id.success) return jsonError(400, "Invalid wallet id.");
  try {
    await removeWallet(ctx.supabase, ctx.user.id, id.data);
    return jsonOk({ ok: true });
  } catch {
    return jsonError(500, "Could not remove wallet.");
  }
}
