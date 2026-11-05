import type { PortfolioSnapshot, RiskAnalysis, RiskCategoryResult, RiskIndicator } from "@/types";

/**
 * VEIL AI Private Risk Engine — pure, deterministic scoring.
 *
 * Every score is 0 (lower risk) … 100 (higher risk) and is computed from
 * observable inputs only. The exact inputs are returned with each category
 * so users can audit the calculation. When an input is unavailable the
 * category is reported as `null` (insufficient data) and excluded from the
 * overall score — it is never guessed.
 */

export const RISK_DISCLAIMER =
  "VEIL AI provides informational analysis only. It is not financial, investment, tax or legal advice, and no score guarantees any outcome. Crypto assets are volatile and you can lose money.";

export const WEIGHTS: Record<RiskCategoryResult["id"], number> = {
  concentration: 0.22,
  volatility: 0.2,
  liquidity: 0.15,
  exposure: 0.13,
  performance: 0.1,
  activity: 0.1,
  suspicious: 0.1,
};

export interface RiskInputs {
  portfolio: PortfolioSnapshot;
  /** Daily close prices keyed by holding contractId (oldest → newest). */
  priceHistory: Record<string, number[]>;
  /** Indicators from tracked wallets' recent activity (may be empty). */
  walletIndicators: RiskIndicator[];
  activityAvailable: boolean;
}

export const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Herfindahl–Hirschman index over value shares (0–1). */
export function hhi(values: number[]): number | null {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  return values.reduce((s, v) => s + (v / total) ** 2, 0);
}

/** Annualised volatility from daily closes using log returns (sample stdev). */
export function annualisedVolatility(prices: number[]): number | null {
  const p = prices.filter((x) => x > 0);
  if (p.length < 8) return null;
  const rets: number[] = [];
  for (let i = 1; i < p.length; i++) rets.push(Math.log(p[i] / p[i - 1]));
  const mean = rets.reduce((s, v) => s + v, 0) / rets.length;
  const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(365);
}

/** Maximum peak-to-trough decline of a series, as a fraction (0–1). */
export function maxDrawdown(series: number[]): number | null {
  if (series.length < 2) return null;
  let peak = series[0];
  let mdd = 0;
  for (const v of series) {
    if (v > peak) peak = v;
    if (peak > 0) mdd = Math.max(mdd, (peak - v) / peak);
  }
  return mdd;
}

/** Reconstruct a value series for current holdings over the history window. */
export function reconstructSeries(
  holdings: { contractId: string; amount: number }[],
  history: Record<string, number[]>,
): number[] {
  const usable = holdings.filter((h) => (history[h.contractId]?.length ?? 0) >= 2);
  if (usable.length === 0) return [];
  const len = Math.min(...usable.map((h) => history[h.contractId].length));
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    let v = 0;
    for (const h of usable) {
      const series = history[h.contractId];
      v += h.amount * series[series.length - len + i];
    }
    out.push(v);
  }
  return out;
}

const SEVERITY_SCORE: Record<RiskIndicator["severity"], number> = { info: 5, low: 30, medium: 60, high: 90 };

function indicatorScore(list: RiskIndicator[]): number {
  const meaningful = list.filter((i) => i.id !== "none");
  if (meaningful.length === 0) return 0;
  const max = Math.max(...meaningful.map((i) => SEVERITY_SCORE[i.severity]));
  // Small increment for multiple distinct indicators, capped.
  return clamp(max + (meaningful.length - 1) * 5);
}

export function levelFor(score: number | null): RiskAnalysis["level"] {
  if (score === null) return "insufficient-data";
  if (score < 25) return "low";
  if (score < 45) return "moderate";
  if (score < 65) return "elevated";
  return "high";
}

export function analyseRisk(input: RiskInputs): Omit<RiskAnalysis, "provenance"> {
  const { portfolio } = input;
  const priced = portfolio.holdings.filter((h) => (h.valueUsd ?? 0) > 0);
  const total = priced.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
  const categories: RiskCategoryResult[] = [];

  // Merge holdings by symbol for concentration (liquid + staked NEAR are one exposure).
  const bySymbol = new Map<string, number>();
  for (const h of priced) bySymbol.set(h.symbol, (bySymbol.get(h.symbol) ?? 0) + (h.valueUsd ?? 0));

  // 1. Concentration — HHI.
  const h = hhi([...bySymbol.values()]);
  const top = [...bySymbol.entries()].sort((a, b) => b[1] - a[1])[0];
  categories.push({
    id: "concentration",
    label: "Portfolio concentration",
    weight: WEIGHTS.concentration,
    score: h === null ? null : r2(clamp(h * 100)),
    explanation:
      h === null
        ? "No priced assets to measure."
        : `Herfindahl–Hirschman index of ${r2(h)} across ${bySymbol.size} priced asset(s). 1.0 means everything is in one asset; ${r2(1 / Math.max(1, bySymbol.size))} would be a perfectly even split.`,
    inputs: { hhi: h === null ? null : r2(h), pricedAssets: bySymbol.size, largestAsset: top?.[0] ?? null, largestSharePct: top ? r2((top[1] / total) * 100) : null },
    precautions:
      h !== null && h > 0.5
        ? ["Consider whether a single-asset failure would be acceptable to you.", "Diversification across uncorrelated assets reduces concentration risk."]
        : ["Concentration is moderate — review periodically as prices move."],
  });

  // 2. Exposure — largest single non-stablecoin asset.
  const nonStable = [...bySymbol.entries()].filter(([sym]) => !priced.find((p) => p.symbol === sym)?.isStablecoin);
  const topVolatile = nonStable.sort((a, b) => b[1] - a[1])[0];
  const exposurePct = topVolatile && total > 0 ? (topVolatile[1] / total) * 100 : total > 0 ? 0 : null;
  categories.push({
    id: "exposure",
    label: "Single-token exposure",
    weight: WEIGHTS.exposure,
    score: exposurePct === null ? null : r2(clamp(exposurePct)),
    explanation:
      exposurePct === null
        ? "No priced assets."
        : topVolatile
          ? `${topVolatile[0]} is ${r2(exposurePct)}% of portfolio value and is not a stablecoin.`
          : "All priced value is in stablecoins (stablecoins carry issuer and de-peg risk instead).",
    inputs: { largestVolatileAsset: topVolatile?.[0] ?? null, sharePct: exposurePct === null ? null : r2(exposurePct) },
    precautions: ["Size positions so that a severe drawdown in one token stays within your tolerance."],
  });

  // 3. Volatility — value-weighted annualised volatility (30d daily).
  let volWeighted = 0;
  let volCovered = 0;
  const volPerAsset: Record<string, number | null> = {};
  for (const hd of priced) {
    const v = hd.isStablecoin && !input.priceHistory[hd.contractId] ? 0 : annualisedVolatility(input.priceHistory[hd.contractId] ?? []);
    volPerAsset[hd.symbol] = v === null ? null : r2(v * 100);
    if (v === null) continue;
    volWeighted += v * (hd.valueUsd ?? 0);
    volCovered += hd.valueUsd ?? 0;
  }
  const coverage = total > 0 ? volCovered / total : 0;
  const portfolioVol = volCovered > 0 ? volWeighted / volCovered : null;
  categories.push({
    id: "volatility",
    label: "Asset volatility",
    weight: WEIGHTS.volatility,
    score: portfolioVol === null || coverage < 0.5 ? null : r2(clamp((portfolioVol / 1.5) * 100)),
    explanation:
      portfolioVol === null || coverage < 0.5
        ? "Not enough price history (need ≥ 8 daily prices for at least half of portfolio value)."
        : `Value-weighted annualised volatility ≈ ${r2(portfolioVol * 100)}% from 30 days of daily prices (covering ${r2(coverage * 100)}% of value). 150% maps to the maximum score.`,
    inputs: { annualisedVolPct: portfolioVol === null ? null : r2(portfolioVol * 100), coveragePct: r2(coverage * 100), ...prefix("volPct_", volPerAsset) },
    precautions: ["Expect large day-to-day swings; avoid leverage you could not hold through a drawdown."],
  });

  // 4. Liquidity — share of value not routable via NEAR Intents (incl. staked).
  const illiquid = priced.filter((x) => !x.intentsRoutable).reduce((s, x) => s + (x.valueUsd ?? 0), 0);
  const staked = priced.filter((x) => x.contractId === "near:staked").reduce((s, x) => s + (x.valueUsd ?? 0), 0);
  const illiquidPct = total > 0 ? (illiquid / total) * 100 : null;
  categories.push({
    id: "liquidity",
    label: "Liquidity",
    weight: WEIGHTS.liquidity,
    score: illiquidPct === null ? null : r2(clamp(illiquidPct)),
    explanation:
      illiquidPct === null
        ? "No priced assets."
        : `${r2(illiquidPct)}% of value is either not listed on NEAR Intents (1Click token list) or is staked (staked NEAR takes ~2–3 days to unstake). Listing is a routability signal, not a guarantee of depth.`,
    inputs: { illiquidPct: illiquidPct === null ? null : r2(illiquidPct), stakedPct: total > 0 ? r2((staked / total) * 100) : null },
    precautions: ["Keep enough liquid assets for planned expenses; check slippage before large swaps."],
  });

  // 5. Historical performance — 30d return and max drawdown of current holdings.
  const series = reconstructSeries(priced, input.priceHistory);
  const mdd = maxDrawdown(series);
  const ret = series.length >= 2 && series[0] > 0 ? (series[series.length - 1] / series[0] - 1) * 100 : null;
  categories.push({
    id: "performance",
    label: "Historical performance",
    weight: WEIGHTS.performance,
    score: mdd === null ? null : r2(clamp(mdd * 200)),
    explanation:
      mdd === null
        ? "Price history unavailable."
        : `Holding today's balances over the last ${series.length} days would have returned ${r2(ret ?? 0)}% with a maximum drawdown of ${r2(mdd * 100)}% (50% drawdown maps to the maximum score). Past performance does not predict future results.`,
    inputs: { returnPct30d: ret === null ? null : r2(ret), maxDrawdownPct: mdd === null ? null : r2(mdd * 100), days: series.length },
    precautions: ["Review assets with the deepest drawdowns against your investment thesis."],
  });

  // 6 & 7. Activity / suspicious — from tracked wallets' recent on-chain activity.
  const activityIds = new Set(["activity-burst", "failed-ratio", "key-changes"]);
  const suspiciousIds = new Set(["risk-list-interaction", "drain-pattern", "airdrop-spam"]);
  const activity = input.walletIndicators.filter((i) => activityIds.has(i.id));
  const suspicious = input.walletIndicators.filter((i) => suspiciousIds.has(i.id));
  categories.push({
    id: "activity",
    label: "Unusual wallet activity",
    weight: WEIGHTS.activity,
    score: input.activityAvailable ? indicatorScore(activity) : null,
    explanation: !input.activityAvailable
      ? "Transaction history unavailable."
      : activity.length
        ? activity.map((a) => `${a.title}: ${a.evidence[0]}`).join(" ")
        : "No unusual activity patterns detected in recent transactions.",
    inputs: { indicators: activity.length },
    precautions: ["Review recent transactions you do not recognise and revoke unused access keys."],
  });
  categories.push({
    id: "suspicious",
    label: "Potentially suspicious transactions",
    weight: WEIGHTS.suspicious,
    score: input.activityAvailable ? indicatorScore(suspicious) : null,
    explanation: !input.activityAvailable
      ? "Transaction history unavailable."
      : suspicious.length
        ? suspicious.map((a) => `${a.title}: ${a.evidence[0]}`).join(" ")
        : "No transactions matched suspicious-pattern heuristics. This is not proof of safety.",
    inputs: { indicators: suspicious.length },
    precautions: ["Never sign transactions for unknown token contracts or 'claim' sites.", "VEIL AI will never ask for your seed phrase."],
  });

  const scored = categories.filter((c) => c.score !== null);
  const wsum = scored.reduce((s, c) => s + c.weight, 0);
  const overall = total > 0 && wsum >= 0.4 ? r2(scored.reduce((s, c) => s + (c.score as number) * c.weight, 0) / wsum) : null;

  return {
    overallScore: overall,
    level: levelFor(overall),
    categories,
    methodology: [
      "Scores range 0 (lower risk) to 100 (higher risk). The overall score is the weighted mean of available categories; weights are re-normalised when a category lacks data, and no overall score is produced if less than 40% of the weight is available.",
      `Weights: ${Object.entries(WEIGHTS).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(", ")}.`,
      "Concentration uses the Herfindahl–Hirschman index of value shares; exposure is the largest non-stablecoin share.",
      "Volatility is the sample standard deviation of daily log returns × √365, value-weighted across assets with ≥ 8 daily prices (CoinGecko).",
      "Liquidity is the share of value not listed on NEAR Intents or locked in staking.",
      "Performance replays current balances over the price history window (return and maximum drawdown).",
      "Activity and suspicious-transaction categories are derived from heuristic indicators on recent NearBlocks history; each indicator lists its evidence.",
    ],
    disclaimer: RISK_DISCLAIMER,
  };
}

function prefix(p: string, obj: Record<string, number | null>) {
  const out: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(obj)) out[`${p}${k}`] = v;
  return out;
}
