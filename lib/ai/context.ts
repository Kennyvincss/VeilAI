import type { FinancialPreferences, NormalizedTx, PortfolioSnapshot, RiskAnalysis } from "@/types";
import { dataBlock } from "@/lib/security/prompt-guard";
import { KNOWN_CONTRACTS } from "@/lib/wallet-intel/known";

/**
 * Data minimisation for AI context.
 *
 * Before anything is sent to NEAR AI Cloud:
 *  - The user's wallet IDs are replaced with labels ("Wallet A", "Wallet B").
 *  - Counterparty accounts are pseudonymised ("Counterparty-1") unless they
 *    are well-known public protocol contracts.
 *  - Amounts are rounded; raw balances, icons, hashes and timestamps finer
 *    than a day are dropped.
 *  - Email, user id and session data are never included.
 *
 * The mapping stays on the server for the duration of the request only.
 */

export class Pseudonymizer {
  private wallets = new Map<string, string>();
  private others = new Map<string, string>();

  constructor(ownWallets: string[]) {
    ownWallets.forEach((w, i) => this.wallets.set(w, `Wallet ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`));
  }

  label(account: string | null | undefined): string {
    if (!account) return "unknown";
    const own = this.wallets.get(account);
    if (own) return own;
    if (KNOWN_CONTRACTS[account]) return `${account} (${KNOWN_CONTRACTS[account]})`;
    if (account === "system") return "system";
    let l = this.others.get(account);
    if (!l) {
      l = `Counterparty-${this.others.size + 1}`;
      this.others.set(account, l);
    }
    return l;
  }

  /** Reverse map for the UI only — never sent to the model. */
  legend(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.wallets) out[v] = k;
    return out;
  }
}

const sig = (n: number | null | undefined, digits = 4) =>
  n === null || n === undefined || !Number.isFinite(n) ? null : Number(n.toPrecision(digits));
const usd = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);

export function portfolioContext(p: PortfolioSnapshot, ps: Pseudonymizer) {
  return {
    mode: p.provenance.mode,
    totalValueUsd: usd(p.totalValueUsd),
    change24hPct: sig(p.change24hPct, 3),
    change24hUsd: usd(p.change24hUsd),
    walletCount: p.wallets.length,
    wallets: p.wallets.map((w) => ({ wallet: ps.label(w.accountId), valueUsd: usd(w.valueUsd), nativeNear: sig(w.nativeNear), stakedNear: sig(w.stakedNear) })),
    holdings: p.holdings.slice(0, 20).map((h) => ({
      symbol: h.symbol,
      name: h.name,
      amount: sig(h.amount, 6),
      priceUsd: sig(h.priceUsd, 6),
      valueUsd: usd(h.valueUsd),
      change24hPct: sig(h.change24hPct, 3),
      stablecoin: h.isStablecoin,
      intentsRoutable: h.intentsRoutable,
      staked: h.contractId === "near:staked",
    })),
    allocation: p.allocation.map((a) => ({ symbol: a.symbol, pct: sig(a.pct, 3) })),
    unpricedAssets: p.unpricedAssets,
  };
}

export function riskContext(r: RiskAnalysis) {
  return {
    overallScore: r.overallScore,
    level: r.level,
    categories: r.categories.map((c) => ({ id: c.id, score: c.score, explanation: c.explanation, inputs: c.inputs })),
  };
}

export function transactionsContext(txs: NormalizedTx[], ps: Pseudonymizer) {
  return txs.slice(0, 30).map((t) => ({
    day: t.timestamp.slice(0, 10),
    direction: t.direction,
    from: ps.label(t.signer),
    to: ps.label(t.receiver),
    actions: t.actions.slice(0, 3).map((a) => (a.method ? `${a.kind}:${a.method}` : a.kind)),
    depositNear: sig(t.depositNear),
    success: t.success,
  }));
}

export function preferencesContext(p: FinancialPreferences | null) {
  if (!p || !p.useInAi) return null;
  return {
    timeframe: p.timeframe,
    riskTolerance: p.riskTolerance,
    ecosystems: p.ecosystems,
    watchlist: p.watchlist,
    goals: p.goals,
  };
}

export type Intent = "portfolio" | "risk" | "transactions" | "performance" | "report" | "general";

export function detectIntents(question: string): Set<Intent> {
  const q = question.toLowerCase();
  const out = new Set<Intent>(["portfolio"]);
  if (/risk|concentrat|exposure|volatil|liquid|safe|danger|threat|report/.test(q)) out.add("risk");
  if (/transact|trade|trading|behavio|activity|recent|transfer|swap|sent|received|explain my/.test(q)) out.add("transactions");
  if (/perform|poor|worst|best|loss|gain|return|drawdown/.test(q)) {
    out.add("performance");
    out.add("risk");
  }
  if (/report|summary|summar/.test(q)) out.add("report");
  return out;
}

export function buildContextMessage(parts: {
  portfolio?: PortfolioSnapshot | null;
  risk?: RiskAnalysis | null;
  transactions?: NormalizedTx[] | null;
  preferences?: FinancialPreferences | null;
  ps: Pseudonymizer;
}): string {
  const blocks: string[] = [];
  if (parts.portfolio) blocks.push(dataBlock("portfolio", portfolioContext(parts.portfolio, parts.ps)));
  if (parts.risk) blocks.push(dataBlock("risk_analysis", riskContext(parts.risk)));
  if (parts.transactions?.length) blocks.push(dataBlock("recent_transactions", transactionsContext(parts.transactions, parts.ps)));
  const prefs = preferencesContext(parts.preferences ?? null);
  if (prefs) blocks.push(dataBlock("user_preferences", prefs));
  if (blocks.length === 0) return "No portfolio data is available for this user yet.";
  return `Financial data for this session (mode: ${parts.portfolio?.provenance.mode ?? "unknown"}). Use it to answer.\n\n${blocks.join("\n\n")}`;
}
