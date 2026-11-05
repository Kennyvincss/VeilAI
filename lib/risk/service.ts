import "server-only";
import type { PortfolioSnapshot, RiskAnalysis, RiskIndicator } from "@/types";
import { coingeckoDailyPrices } from "@/lib/blockchain/prices";
import { accountFtTransfers, accountTransactions, nearblocksBase, normalizeFtTxn, normalizeTxn } from "@/lib/blockchain/nearblocks";
import { computeStats, riskIndicators } from "@/lib/wallet-intel/analyze";
import { analyseRisk } from "@/lib/risk/engine";

const MAX_HISTORY_ASSETS = 6;
const MAX_ACTIVITY_WALLETS = 3;

/** Gathers live inputs (price history + wallet activity) and runs the engine. */
export async function liveRiskAnalysis(portfolio: PortfolioSnapshot): Promise<RiskAnalysis> {
  const sources = [...portfolio.provenance.sources];
  const notes = [...portfolio.provenance.notes];

  const top = portfolio.holdings
    .filter((h) => (h.valueUsd ?? 0) > 0 && h.coingeckoId)
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
    .slice(0, MAX_HISTORY_ASSETS);

  const priceHistory: Record<string, number[]> = {};
  const byCg = new Map<string, number[] | null>();
  let historyOk = true;
  await Promise.all(
    [...new Set(top.map((h) => h.coingeckoId as string))].map(async (id) => {
      try {
        byCg.set(id, await coingeckoDailyPrices(id, 30));
      } catch {
        historyOk = false;
        byCg.set(id, null);
      }
    }),
  );
  for (const h of top) {
    const s = byCg.get(h.coingeckoId as string);
    if (s && s.length) priceHistory[h.contractId] = s;
  }
  sources.push({
    name: "CoinGecko API",
    url: "https://api.coingecko.com/api/v3/coins/{id}/market_chart",
    purpose: "30-day daily price history (volatility, drawdown)",
    fetchedAt: new Date().toISOString(),
    ok: historyOk,
    ...(historyOk ? {} : { error: "some price histories unavailable" }),
  });

  const indicators: RiskIndicator[] = [];
  let activityAvailable = false;
  const wallets = portfolio.wallets.filter((w) => w.ok).slice(0, MAX_ACTIVITY_WALLETS);
  await Promise.all(
    wallets.map(async (w) => {
      try {
        const [txs, fts] = await Promise.all([accountTransactions(w.accountId, 50), accountFtTransfers(w.accountId, 25).catch(() => [])]);
        const ntx = txs.map((t) => normalizeTxn(w.accountId, t));
        const nft = fts.map(normalizeFtTxn);
        const stats = computeStats(w.accountId, ntx, nft, null);
        indicators.push(...riskIndicators(w.accountId, ntx, nft, stats, w.nativeNear));
        activityAvailable = true;
      } catch {
        /* NearBlocks unavailable for this wallet */
      }
    }),
  );
  sources.push({
    name: "NearBlocks API",
    url: nearblocksBase(),
    purpose: "Recent wallet activity for activity/suspicious-pattern heuristics",
    fetchedAt: new Date().toISOString(),
    ok: activityAvailable,
    ...(activityAvailable ? {} : { error: "transaction history unavailable" }),
  });
  if (portfolio.wallets.length > MAX_ACTIVITY_WALLETS) notes.push(`Activity heuristics use the first ${MAX_ACTIVITY_WALLETS} tracked wallets.`);

  return {
    provenance: { mode: "live", sources, generatedAt: new Date().toISOString(), notes },
    ...analyseRisk({ portfolio, priceHistory, walletIndicators: indicators, activityAvailable }),
  };
}
