import type { FinancialReport, PortfolioSnapshot, RiskAnalysis, VerificationResult, WalletIntelReport } from "@/types";
import { formatAmount, formatDate, formatPct, formatUsd } from "@/lib/utils/format";
import { RISK_DISCLAIMER } from "@/lib/risk/engine";

/**
 * Pure report builders. Each report embeds its timestamp, data sources,
 * methodology and a disclaimer so the exported PDF stands on its own.
 */

const PORTFOLIO_METHOD = [
  "Native NEAR balances from NEAR JSON-RPC `view_account`; staked NEAR from staking-pool `get_account_total_balance`.",
  "Fungible-token balances from FastNEAR; token decimals/symbols from each contract's NEP-148 `ft_metadata`.",
  "USD prices from the NEAR Intents 1Click token list, with CoinGecko as fallback; 24h change from CoinGecko.",
  "Assets without a price are excluded from totals and shown as unpriced.",
];

export function portfolioReport(p: PortfolioSnapshot): FinancialReport {
  return {
    type: "portfolio",
    title: "Portfolio Report",
    generatedAt: new Date().toISOString(),
    mode: p.provenance.mode,
    subject: `${p.wallets.length} wallet(s)`,
    sections: [
      {
        heading: "Summary",
        body: `Total priced value ${formatUsd(p.totalValueUsd)}; 24h change ${formatPct(p.change24hPct, { sign: true })} (${formatUsd(p.change24hUsd)}). ${p.unpricedAssets} unpriced asset(s) excluded.`,
      },
      {
        heading: "Holdings",
        table: {
          columns: ["Asset", "Amount", "Price (USD)", "Value (USD)", "24h", "Intents"],
          rows: p.holdings.map((h) => [
            h.contractId === "near:staked" ? "NEAR (staked)" : h.symbol,
            formatAmount(h.amount),
            h.priceUsd === null ? "—" : formatUsd(h.priceUsd),
            formatUsd(h.valueUsd),
            formatPct(h.change24hPct, { sign: true }),
            h.intentsRoutable ? "Yes" : "No",
          ]),
        },
      },
      {
        heading: "Allocation",
        table: { columns: ["Asset", "Share", "Value (USD)"], rows: p.allocation.map((a) => [a.symbol, formatPct(a.pct, { digits: 1 }), formatUsd(a.valueUsd)]) },
      },
      {
        heading: "Wallets",
        table: {
          columns: ["Account", "NEAR", "Staked NEAR", "Value (USD)", "Status"],
          rows: p.wallets.map((w) => [w.accountId, formatAmount(w.nativeNear), formatAmount(w.stakedNear), formatUsd(w.valueUsd), w.ok ? "OK" : (w.error ?? "Error")]),
        },
      },
      ...(p.provenance.notes.length ? [{ heading: "Notes", body: p.provenance.notes.join("\n") }] : []),
    ],
    sources: p.provenance.sources,
    methodology: PORTFOLIO_METHOD,
    disclaimer: RISK_DISCLAIMER,
  };
}

export function riskReport(r: RiskAnalysis): FinancialReport {
  return {
    type: "risk",
    title: "Risk Report",
    generatedAt: new Date().toISOString(),
    mode: r.provenance.mode,
    subject: "Tracked portfolio",
    sections: [
      { heading: "Overall", body: `Overall risk score: ${r.overallScore ?? "insufficient data"} / 100 (${r.level}).` },
      {
        heading: "Categories",
        table: {
          columns: ["Category", "Score", "Weight", "Explanation"],
          rows: r.categories.map((c) => [c.label, c.score === null ? "n/a" : c.score, `${Math.round(c.weight * 100)}%`, c.explanation]),
        },
      },
      { heading: "Suggested precautions", body: [...new Set(r.categories.flatMap((c) => c.precautions))].map((p) => `• ${p}`).join("\n") },
      ...(r.provenance.notes.length ? [{ heading: "Notes", body: r.provenance.notes.join("\n") }] : []),
    ],
    sources: r.provenance.sources,
    methodology: r.methodology,
    disclaimer: r.disclaimer,
  };
}

export function walletReport(w: WalletIntelReport): FinancialReport {
  return {
    type: "wallet",
    title: "Wallet Intelligence Report",
    generatedAt: new Date().toISOString(),
    mode: w.provenance.mode,
    subject: w.accountId,
    sections: [
      {
        heading: "Overview (on-chain facts)",
        table: {
          columns: ["Field", "Value"],
          rows: [
            ["Account", w.accountId],
            ["Type", w.overview.accountType],
            ["Exists", w.overview.exists ? "Yes" : "No"],
            ["Contract deployed", w.overview.isContract ? "Yes" : "No"],
            ["NEAR balance", formatAmount(w.overview.nativeNear)],
            ["Tokens held", w.overview.tokenCount ?? "—"],
            ["First seen (sample)", formatDate(w.overview.firstSeen)],
            ["Last seen", formatDate(w.overview.lastSeen)],
          ],
        },
      },
      {
        heading: "Transaction statistics (sample)",
        table: {
          columns: ["Metric", "Value"],
          rows: [
            ["Sampled transactions", w.stats.sampledTransactions],
            ["Indexed transactions (total)", w.stats.totalTransactionsIndexed ?? "—"],
            ["Failed", w.stats.failedTransactions],
            ["Tx per day", w.stats.txPerDay ?? "—"],
            ["NEAR in / out", `${formatAmount(w.stats.nearIn)} / ${formatAmount(w.stats.nearOut)}`],
            ["Unique counterparties", w.stats.uniqueCounterparties],
          ],
        },
      },
      {
        heading: "Risk indicators (heuristics — not verdicts)",
        table: { columns: ["Severity", "Indicator", "Evidence"], rows: w.riskIndicators.map((i) => [i.severity.toUpperCase(), i.title, i.evidence.join(" ")]) },
      },
      {
        heading: "Large transfers",
        table: {
          columns: ["Date", "Direction", "Amount", "Counterparty"],
          rows: w.largeTransfers.length ? w.largeTransfers.map((t) => [formatDate(t.timestamp), t.direction, `${formatAmount(t.amount)} ${t.asset}`, t.counterparty]) : [["—", "—", "None in sample", "—"]],
        },
      },
      {
        heading: "Contract interactions",
        table: {
          columns: ["Contract", "Calls", "Methods"],
          rows: w.contractInteractions.length ? w.contractInteractions.map((c) => [c.contract, c.calls, c.methods.join(", ")]) : [["—", 0, "None in sample"]],
        },
      },
      { heading: "Notes", body: w.provenance.notes.join("\n") },
    ],
    sources: w.provenance.sources,
    methodology: [
      "Data: NearBlocks `txns-only` and `ft-txns` (most recent 50 each), NEAR RPC `view_account`, FastNEAR token list.",
      "Large transfers: ≥ 1,000 NEAR or ≥ 10,000 units of a USD stablecoin.",
      "Indicators are conservative heuristics with cited evidence; they never establish that an account is malicious.",
    ],
    disclaimer: RISK_DISCLAIMER,
  };
}

export function aiSummaryReport(base: FinancialReport[], summary: string, verification: VerificationResult | null, mode: "live" | "demo", inference: string): FinancialReport {
  return {
    type: "ai-summary",
    title: "AI Financial Summary",
    generatedAt: new Date().toISOString(),
    mode,
    subject: "Tracked portfolio",
    sections: [
      { heading: `Executive summary (${inference})`, body: summary },
      ...(verification
        ? [{ heading: "Confidential processing verification", body: `${verification.state.toUpperCase()} — ${verification.summary}\nModel: ${verification.model}\nNonce: ${verification.nonce || "—"}\nCompleted: ${verification.completedAt}` }]
        : []),
      ...base.flatMap((r) => r.sections.slice(0, 2).map((s) => ({ ...s, heading: `${r.title}: ${s.heading}` }))),
    ],
    sources: base.flatMap((r) => r.sources),
    methodology: [...new Set(base.flatMap((r) => r.methodology)), "The summary is AI-generated from the data above; verify important figures against the tables."],
    disclaimer: RISK_DISCLAIMER,
    verification,
  };
}
