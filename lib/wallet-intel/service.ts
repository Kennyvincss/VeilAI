import "server-only";
import type { WalletIntelReport } from "@/types";
import { SourceTracker } from "@/lib/blockchain/http";
import {
  accountFtTransfers,
  accountTransactionCount,
  accountTransactions,
  nearblocksBase,
  normalizeFtTxn,
  normalizeTxn,
} from "@/lib/blockchain/nearblocks";
import { accountFungibleTokens, fastnearBase } from "@/lib/blockchain/fastnear";
import { rpcEndpoints, viewAccount } from "@/lib/near/rpc";
import { accountKind } from "@/lib/near/account";
import { yoctoToNear } from "@/lib/utils/units";
import {
  buildTimeline,
  computeStats,
  contractInteractions,
  largeTransfers,
  riskIndicators,
  topCounterparties,
} from "@/lib/wallet-intel/analyze";
import { riskListSize } from "@/lib/wallet-intel/known";

/** Builds a LIVE wallet intelligence report from public on-chain data. */
export async function investigateWallet(accountId: string): Promise<WalletIntelReport> {
  const sources = new SourceTracker();
  const notes: string[] = [];

  const acct = await sources
    .track("NEAR RPC", rpcEndpoints()[0], "Account state (view_account)", () => viewAccount(accountId))
    .catch(() => undefined);

  const [txRes, ftRes, countRes, tokenRes] = await Promise.allSettled([
    sources.track("NearBlocks API", nearblocksBase(), "Transaction history (txns-only)", () => accountTransactions(accountId, 50)),
    sources.track("NearBlocks API", nearblocksBase(), "Token transfers (ft-txns)", () => accountFtTransfers(accountId, 50)),
    accountTransactionCount(accountId),
    sources.track("FastNEAR API", fastnearBase(), "Token holdings", () => accountFungibleTokens(accountId)),
  ]);

  const txs = txRes.status === "fulfilled" ? txRes.value.map((t) => normalizeTxn(accountId, t)) : [];
  const fts = ftRes.status === "fulfilled" ? ftRes.value.map(normalizeFtTxn) : [];
  if (txRes.status === "rejected") notes.push("Transaction history unavailable from NearBlocks (rate limit or outage). Statistics below are incomplete.");
  if (ftRes.status === "rejected") notes.push("Token transfer history unavailable from NearBlocks.");
  if (acct === undefined) notes.push("Account state unavailable from NEAR RPC.");

  const totalIndexed = countRes.status === "fulfilled" ? countRes.value : null;
  const stats = computeStats(accountId, txs, fts, totalIndexed);
  const nativeNear = acct ? yoctoToNear(acct.amount) : null;
  const times = txs.map((t) => t.timestamp).sort();

  notes.push(`Analysis covers the most recent ${txs.length} transactions and ${fts.length} token transfers (sample), not full history.`);
  notes.push(
    riskListSize() > 0
      ? `Counterparties were checked against ${riskListSize()} entries from sourced public risk lists.`
      : "Counterparties are only labelled as risky when they appear on a sourced public risk list; none matched.",
  );

  return {
    provenance: { mode: "live", sources: sources.all(), generatedAt: new Date().toISOString(), notes },
    accountId,
    overview: {
      exists: acct !== null && acct !== undefined,
      nativeNear,
      storageUsage: acct?.storage_usage ?? null,
      isContract: acct?.isContract ?? false,
      accountType: accountKind(accountId),
      firstSeen: times[0] ?? null,
      lastSeen: times[times.length - 1] ?? null,
      tokenCount:
        tokenRes.status === "fulfilled" ? tokenRes.value.filter((t) => t.balance && t.balance !== "0").length : null,
    },
    stats,
    timeline: buildTimeline(txs),
    topCounterparties: topCounterparties(accountId, txs, fts),
    contractInteractions: contractInteractions(accountId, txs),
    largeTransfers: largeTransfers(accountId, txs, fts),
    riskIndicators: riskIndicators(accountId, txs, fts, stats, nativeNear),
    recentTransactions: txs.slice(0, 25),
    ftTransfers: fts.slice(0, 25),
  };
}
