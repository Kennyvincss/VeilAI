import type { PortfolioSnapshot, Provenance, TokenHolding, WalletBalanceSummary } from "@/types";

/**
 * Pure portfolio maths. No I/O — every function here is deterministic and
 * covered by unit tests.
 */

/** Merge holdings of the same asset across wallets. */
export function mergeHoldings(list: TokenHolding[]): TokenHolding[] {
  const map = new Map<string, TokenHolding>();
  for (const h of list) {
    const existing = map.get(h.contractId);
    if (!existing) {
      map.set(h.contractId, { ...h, wallets: [...h.wallets] });
      continue;
    }
    existing.amount += h.amount;
    existing.rawBalance = (BigInt(existing.rawBalance || "0") + BigInt(h.rawBalance || "0")).toString();
    existing.valueUsd =
      existing.valueUsd === null && h.valueUsd === null ? null : (existing.valueUsd ?? 0) + (h.valueUsd ?? 0);
    existing.wallets = [...new Set([...existing.wallets, ...h.wallets])];
  }
  return [...map.values()];
}

export function valueOf(amount: number, price: number | null): number | null {
  if (price === null || !Number.isFinite(price)) return null;
  return amount * price;
}

/**
 * Value-weighted 24h change. For each priced asset with a known 24h change
 * c (percent), its value 24h ago is v / (1 + c/100).
 */
export function portfolioChange24h(holdings: TokenHolding[]): { pct: number | null; usd: number | null } {
  let now = 0;
  let before = 0;
  let covered = 0;
  for (const h of holdings) {
    if (h.valueUsd === null || h.change24hPct === null || !Number.isFinite(h.change24hPct)) continue;
    if (h.change24hPct <= -100) continue;
    now += h.valueUsd;
    before += h.valueUsd / (1 + h.change24hPct / 100);
    covered++;
  }
  if (covered === 0 || before <= 0) return { pct: null, usd: null };
  return { pct: ((now - before) / before) * 100, usd: now - before };
}

/** Allocation by symbol, top N with the remainder grouped as "Other". */
export function allocation(holdings: TokenHolding[], topN = 6) {
  const priced = holdings
    .filter((h) => h.valueUsd !== null && h.valueUsd > 0)
    .map((h) => ({ symbol: h.symbol, valueUsd: h.valueUsd as number }));
  // Combine same symbol (e.g. NEAR liquid + NEAR staked shown separately elsewhere).
  const bySymbol = new Map<string, number>();
  for (const p of priced) bySymbol.set(p.symbol, (bySymbol.get(p.symbol) ?? 0) + p.valueUsd);
  const total = [...bySymbol.values()].reduce((s, v) => s + v, 0);
  if (total <= 0) return [];
  const sorted = [...bySymbol.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN).reduce((s, [, v]) => s + v, 0);
  const rows = top.map(([symbol, valueUsd]) => ({ symbol, valueUsd, pct: (valueUsd / total) * 100 }));
  if (rest > 0) rows.push({ symbol: "Other", valueUsd: rest, pct: (rest / total) * 100 });
  return rows;
}

export function buildSnapshot(
  holdingsInput: TokenHolding[],
  wallets: WalletBalanceSummary[],
  provenance: Provenance,
): PortfolioSnapshot {
  const holdings = mergeHoldings(holdingsInput).sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
  const totalValueUsd = holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
  const change = portfolioChange24h(holdings);
  return {
    provenance,
    totalValueUsd,
    change24hPct: change.pct,
    change24hUsd: change.usd,
    holdings,
    wallets,
    allocation: allocation(holdings),
    unpricedAssets: holdings.filter((h) => h.valueUsd === null).length,
  };
}
