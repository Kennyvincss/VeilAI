import type { NextRequest } from "next/server";
import type { NormalizedTx } from "@/types";
import { getRequestContext } from "@/lib/session";
import { listWallets } from "@/lib/supabase/repo";
import { accountTransactions, nearblocksBase, normalizeTxn } from "@/lib/blockchain/nearblocks";
import { demoTransactions, DEMO_NOTE } from "@/lib/demo/data";
import { clientIp, jsonError, jsonOk, limitOrNull } from "@/lib/security/http";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

export const maxDuration = 30;

/** Recent transactions across tracked wallets (live) or the sample set (demo). */
export async function GET(req: NextRequest) {
  const ctx = await getRequestContext();
  if (!ctx.user && !ctx.demo) return jsonError(401, "Sign in or start a demo session.");
  const limited = limitOrNull(`activity:${ctx.user?.id ?? clientIp(req)}`, RATE_LIMITS.portfolio);
  if (limited) return limited;

  if (!ctx.user || !ctx.supabase) {
    return jsonOk({ mode: "demo", transactions: demoTransactions(), notes: [DEMO_NOTE], sources: [] });
  }
  const wallets = (await listWallets(ctx.supabase, ctx.user.id)).slice(0, 3);
  const results = await Promise.allSettled(
    wallets.map(async (w) => (await accountTransactions(w.accountId, 15)).map((t) => ({ ...normalizeTxn(w.accountId, t), wallet: w.accountId }))),
  );
  const txs: (NormalizedTx & { wallet: string })[] = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  txs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const failed = results.filter((r) => r.status === "rejected").length;
  return jsonOk({
    mode: "live",
    transactions: txs.slice(0, 25),
    notes: failed ? [`History unavailable for ${failed} wallet(s) (NearBlocks rate limit or outage).`] : [],
    sources: [{ name: "NearBlocks API", url: nearblocksBase(), purpose: "Recent transactions", fetchedAt: new Date().toISOString(), ok: failed === 0 }],
  });
}
