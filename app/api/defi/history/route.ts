import type { NextRequest } from "next/server";
import { clientIp, jsonError, jsonOk, limitOrNull } from "@/lib/security/http";
import { accountIdSchema } from "@/lib/security/validation";
import { accountFtTransfers, accountTransactions, normalizeFtTxn, normalizeTxn } from "@/lib/blockchain/nearblocks";
import { buildActivity } from "@/lib/defi/history";

export const maxDuration = 30;

/** Recent public activity for a NEAR account, in plain language. */
export async function GET(req: NextRequest) {
  const limited = limitOrNull(`defi-history:${clientIp(req)}`, { limit: 20, windowMs: 5 * 60_000 });
  if (limited) return limited;
  const account = accountIdSchema.safeParse(req.nextUrl.searchParams.get("accountId"));
  if (!account.success) return jsonError(400, "Invalid account.");
  const id = account.data;
  const [txs, fts] = await Promise.allSettled([accountTransactions(id, 25), accountFtTransfers(id, 25)]);
  if (txs.status === "rejected" && fts.status === "rejected") return jsonError(502, "Activity couldn't be loaded right now. Please try again shortly.");
  const items = buildActivity(
    id,
    txs.status === "fulfilled" ? txs.value.map((t) => normalizeTxn(id, t)) : [],
    fts.status === "fulfilled" ? fts.value.map(normalizeFtTxn) : [],
  );
  return jsonOk({ items, partial: txs.status === "rejected" || fts.status === "rejected" }, { cache: "private, max-age=30" });
}
