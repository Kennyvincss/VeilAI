import type { NextRequest } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/session";
import { investigateWallet } from "@/lib/wallet-intel/service";
import { assertSameOrigin, HttpError, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { accountIdSchema, firstIssue } from "@/lib/security/validation";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { matchesNetwork } from "@/lib/near/account";
import { nearNetwork } from "@/lib/env";
import { log } from "@/lib/security/logger";

export const maxDuration = 30;

const schema = z.object({ accountId: accountIdSchema });

/**
 * Investigates any PUBLIC NEAR account. Public on-chain data only; the
 * request itself is not stored.
 */
export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ctx = await getRequestContext();
  if (!ctx.user) return jsonError(401, "Sign in to continue.");
  const limited = limitOrNull(`intel:${ctx.user.id}`, RATE_LIMITS.walletIntel);
  if (limited) return limited;
  try {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, firstIssue(parsed.error));
    if (!matchesNetwork(parsed.data.accountId, nearNetwork())) return jsonError(400, `This account is not on NEAR ${nearNetwork()}.`);
    const report = await investigateWallet(parsed.data.accountId);
    if (!report.overview.exists && report.stats.sampledTransactions === 0) {
      const rpcOk = report.provenance.sources.some((s) => s.name === "NEAR RPC" && s.ok);
      if (rpcOk) return jsonError(404, "That account does not exist on NEAR.");
      return jsonError(502, "Blockchain data providers are unavailable right now. Please retry shortly.");
    }
    return jsonOk(report);
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.message);
    log("error", "wallet_intel.failed", { error: err instanceof Error ? err.message : "unknown" });
    return jsonError(502, "Could not investigate this wallet right now.");
  }
}
