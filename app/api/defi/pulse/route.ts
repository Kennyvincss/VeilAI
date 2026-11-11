import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { clientIp, jsonError, jsonOk, limitOrNull } from "@/lib/security/http";
import { accountIdSchema } from "@/lib/security/validation";
import { viewAccount } from "@/lib/near/rpc";
import { accountFungibleTokens } from "@/lib/blockchain/fastnear";

/**
 * Cheap change detector for notifications: a fingerprint of the account's
 * NEAR and token balances (RPC + FastNEAR). The client only fetches the
 * full activity feed when this changes.
 */
export async function GET(req: NextRequest) {
  const limited = limitOrNull(`defi-pulse:${clientIp(req)}`, { limit: 40, windowMs: 5 * 60_000 });
  if (limited) return limited;
  const account = accountIdSchema.safeParse(req.nextUrl.searchParams.get("accountId"));
  if (!account.success) return jsonError(400, "Invalid account.");
  const [acct, fts] = await Promise.allSettled([viewAccount(account.data), accountFungibleTokens(account.data)]);
  if (acct.status === "rejected" || !acct.value) return jsonError(502, "Balance unavailable.");
  const tokens = fts.status === "fulfilled" ? fts.value.map((t) => `${t.contract_id}=${t.balance ?? ""}`).sort().join(",") : "?";
  const fingerprint = createHash("sha256").update(`${acct.value.amount}|${tokens}`).digest("hex").slice(0, 32);
  return jsonOk({ fingerprint, tokensKnown: fts.status === "fulfilled" });
}
