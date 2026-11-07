import type { NormalizedFtTransfer, NormalizedTx, PortfolioSnapshot, Provenance, RiskAnalysis, TokenHolding, WalletIntelReport } from "@/types";
import { buildSnapshot } from "@/lib/portfolio/compute";
import { analyseRisk } from "@/lib/risk/engine";
import {
  buildTimeline,
  computeStats,
  contractInteractions,
  largeTransfers,
  riskIndicators,
  topCounterparties,
} from "@/lib/wallet-intel/analyze";

/**
 * SAMPLE DATA for demo mode.
 *
 * Every object produced here carries provenance.mode = "demo" and a note
 * that the values are illustrative. Prices are fictional round numbers and
 * must never be presented as market data. Analyses over this data are run
 * through the same real calculation code as live data, so the demo shows
 * exactly how the engine behaves.
 */

export const DEMO_NOTE = "SAMPLE DATA — fictional balances and prices for demonstration. Not real market or account data.";
export const DEMO_WALLETS = ["veil-demo-main.near", "veil-demo-trading.near"];

function demoProvenance(extra: string[] = []): Provenance {
  return {
    mode: "demo",
    sources: [{ name: "Sample dataset", url: "", purpose: "Illustrative data for the sample workspace", fetchedAt: new Date().toISOString(), ok: true }],
    generatedAt: new Date().toISOString(),
    notes: [DEMO_NOTE, ...extra],
  };
}

const h = (p: Partial<TokenHolding> & Pick<TokenHolding, "contractId" | "symbol" | "amount" | "priceUsd">): TokenHolding => ({
  name: p.symbol,
  decimals: 24,
  rawBalance: "0",
  valueUsd: p.priceUsd === null ? null : p.amount * p.priceUsd,
  change24hPct: null,
  intentsRoutable: true,
  isStablecoin: false,
  wallets: [DEMO_WALLETS[0]],
  ...p,
});

export function demoHoldings(): TokenHolding[] {
  return [
    h({ contractId: "near", symbol: "NEAR", name: "NEAR", amount: 4200, priceUsd: 3.0, change24hPct: -2.4, coingeckoId: "near" }),
    h({ contractId: "near:staked", symbol: "NEAR", name: "NEAR (staked)", amount: 2500, priceUsd: 3.0, change24hPct: -2.4, intentsRoutable: false, coingeckoId: "near" }),
    h({ contractId: "usdt.tether-token.near", symbol: "USDt", name: "Tether USD", decimals: 6, amount: 3100, priceUsd: 1.0, change24hPct: 0.01, isStablecoin: true, coingeckoId: "tether" }),
    h({ contractId: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", symbol: "USDC", name: "USD Coin", decimals: 6, amount: 1450, priceUsd: 1.0, change24hPct: -0.02, isStablecoin: true, coingeckoId: "usd-coin", wallets: [DEMO_WALLETS[1]] }),
    h({ contractId: "token.v2.ref-finance.near", symbol: "REF", name: "Ref Finance", decimals: 18, amount: 9800, priceUsd: 0.12, change24hPct: -6.8, wallets: [DEMO_WALLETS[1]], coingeckoId: "ref-finance" }),
    h({ contractId: "aurora", symbol: "AURORA", name: "Aurora", decimals: 18, amount: 2600, priceUsd: 0.1, change24hPct: 3.1, wallets: [DEMO_WALLETS[1]], coingeckoId: "aurora-near" }),
    h({ contractId: "free-airdrop-claim.near", symbol: "CLAIMNOW", name: "Visit claim-site to redeem", decimals: 18, amount: 50000, priceUsd: null, intentsRoutable: false, wallets: [DEMO_WALLETS[0]] }),
  ];
}

export function demoPortfolio(): PortfolioSnapshot {
  const holdings = demoHoldings();
  const byWallet = (w: string) => holdings.filter((x) => x.wallets.includes(w)).reduce((s, x) => s + (x.valueUsd ?? 0), 0);
  return buildSnapshot(
    holdings,
    [
      { accountId: DEMO_WALLETS[0], label: "Main (sample)", nativeNear: 4200, stakedNear: 2500, storageUsage: 2_840, valueUsd: byWallet(DEMO_WALLETS[0]), tokenCount: 2, ok: true },
      { accountId: DEMO_WALLETS[1], label: "Trading (sample)", nativeNear: 0, stakedNear: 0, storageUsage: 1_120, valueUsd: byWallet(DEMO_WALLETS[1]), tokenCount: 3, ok: true },
    ],
    demoProvenance(),
  );
}

/** Deterministic pseudo-random walk so demo charts are stable between renders. */
function walk(seed: number, start: number, days: number, vol: number): number[] {
  let x = seed;
  const rand = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648 - 0.5;
  };
  const out = [start];
  for (let i = 1; i < days; i++) out.push(Math.max(0.0001, out[i - 1] * (1 + rand() * vol)));
  return out;
}

export function demoPriceHistory(): Record<string, number[]> {
  return {
    near: walk(7, 3.4, 30, 0.09),
    "near:staked": walk(7, 3.4, 30, 0.09),
    "usdt.tether-token.near": walk(3, 1, 30, 0.002),
    "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": walk(5, 1, 30, 0.002),
    "token.v2.ref-finance.near": walk(11, 0.17, 30, 0.16),
    aurora: walk(13, 0.11, 30, 0.14),
  };
}

const DAY = 86_400_000;
function iso(daysAgo: number, hour = 12) {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function demoTransactions(subject = DEMO_WALLETS[0]): NormalizedTx[] {
  const fc = (method: string) => [{ kind: "FUNCTION_CALL", method, depositNear: 0 }];
  const rows: Omit<NormalizedTx, "direction">[] = [
    { hash: "DEMOtx1aSampleHash000000000000000001", timestamp: iso(0, 9), signer: subject, receiver: "v2.ref-finance.near", actions: fc("ft_transfer_call"), depositNear: 0, feeNear: 0.0012, success: true },
    { hash: "DEMOtx2aSampleHash000000000000000002", timestamp: iso(1, 15), signer: "exchange-hot-wallet.near", receiver: subject, actions: [{ kind: "TRANSFER", depositNear: 1500 }], depositNear: 1500, feeNear: 0.0004, success: true },
    { hash: "DEMOtx3aSampleHash000000000000000003", timestamp: iso(2, 11), signer: subject, receiver: "astro-stakers.poolv1.near", actions: fc("deposit_and_stake"), depositNear: 500, feeNear: 0.0021, success: true },
    { hash: "DEMOtx4aSampleHash000000000000000004", timestamp: iso(3, 18), signer: subject, receiver: "intents.near", actions: fc("ft_withdraw"), depositNear: 0, feeNear: 0.0015, success: true },
    { hash: "DEMOtx5aSampleHash000000000000000005", timestamp: iso(4, 10), signer: subject, receiver: "friend-sample.near", actions: [{ kind: "TRANSFER", depositNear: 25 }], depositNear: 25, feeNear: 0.0004, success: true },
    { hash: "DEMOtx6aSampleHash000000000000000006", timestamp: iso(6, 8), signer: subject, receiver: "free-airdrop-claim.near", actions: fc("claim"), depositNear: 0, feeNear: 0.0009, success: false },
    { hash: "DEMOtx7aSampleHash000000000000000007", timestamp: iso(9, 14), signer: subject, receiver: "wrap.near", actions: fc("near_deposit"), depositNear: 300, feeNear: 0.0011, success: true },
    { hash: "DEMOtx8aSampleHash000000000000000008", timestamp: iso(12, 20), signer: subject, receiver: "exchange-hot-wallet.near", actions: [{ kind: "TRANSFER", depositNear: 1200 }], depositNear: 1200, feeNear: 0.0004, success: true },
    { hash: "DEMOtx9aSampleHash000000000000000009", timestamp: iso(15, 13), signer: subject, receiver: "contract.main.burrow.near", actions: fc("execute"), depositNear: 0, feeNear: 0.0032, success: true },
    { hash: "DEMOtx10SampleHash000000000000000010", timestamp: iso(21, 16), signer: subject, receiver: subject, actions: [{ kind: "ADD_KEY", depositNear: 0 }], depositNear: 0, feeNear: 0.0004, success: true },
  ];
  return rows.map((r) => ({
    ...r,
    direction: r.signer === subject && r.receiver === subject ? "self" : r.signer === subject ? "out" : r.receiver === subject ? "in" : "other",
  }));
}

export function demoFtTransfers(): NormalizedFtTransfer[] {
  return [
    { hash: "DEMOtx1aSampleHash000000000000000001", timestamp: iso(0, 9), contractId: "usdt.tether-token.near", symbol: "USDt", decimals: 6, delta: -400, counterparty: "v2.ref-finance.near", cause: "TRANSFER" },
    { hash: "DEMOft2aSampleHash000000000000000002", timestamp: iso(5, 9), contractId: "usdt.tether-token.near", symbol: "USDt", decimals: 6, delta: 12000, counterparty: "exchange-hot-wallet.near", cause: "TRANSFER" },
    { hash: "DEMOft3aSampleHash000000000000000003", timestamp: iso(7, 9), contractId: "free-airdrop-claim.near", symbol: "CLAIMNOW", decimals: 18, delta: 50000, counterparty: null, cause: "MINT" },
  ];
}

export function demoRiskAnalysis(): RiskAnalysis {
  const portfolio = demoPortfolio();
  const txs = demoTransactions();
  const fts = demoFtTransfers();
  const stats = computeStats(DEMO_WALLETS[0], txs, fts, null);
  const indicators = riskIndicators(DEMO_WALLETS[0], txs, fts, stats, 4200);
  return {
    provenance: demoProvenance(["Scores are computed by the real VEIL AI risk engine over the sample data."]),
    ...analyseRisk({ portfolio, priceHistory: demoPriceHistory(), walletIndicators: indicators, activityAvailable: true }),
  };
}

export function demoWalletReport(accountId = DEMO_WALLETS[0]): WalletIntelReport {
  const txs = demoTransactions(accountId);
  const fts = demoFtTransfers();
  const stats = computeStats(accountId, txs, fts, 148);
  return {
    provenance: demoProvenance(["This investigation uses sample transactions, not the requested account's real history."]),
    accountId,
    overview: {
      exists: true,
      nativeNear: 4200,
      storageUsage: 2840,
      isContract: false,
      accountType: "named",
      firstSeen: txs[txs.length - 1].timestamp,
      lastSeen: txs[0].timestamp,
      tokenCount: 4,
    },
    stats,
    timeline: buildTimeline(txs),
    topCounterparties: topCounterparties(accountId, txs, fts),
    contractInteractions: contractInteractions(accountId, txs),
    largeTransfers: largeTransfers(accountId, txs, fts),
    riskIndicators: riskIndicators(accountId, txs, fts, stats, 4200),
    recentTransactions: txs,
    ftTransfers: fts,
  };
}
