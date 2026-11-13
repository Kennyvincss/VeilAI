import { describe, expect, it } from "vitest";
import type { PortfolioSnapshot, TokenHolding } from "@/types";
import { analyseRisk, annualisedVolatility, hhi, levelFor, maxDrawdown, reconstructSeries, WEIGHTS } from "@/lib/risk/engine";
import { buildSnapshot } from "@/lib/portfolio/compute";
import { demoPortfolio, demoRiskAnalysis } from "../fixtures/sample-data";

const h = (p: Partial<TokenHolding>): TokenHolding => ({
  contractId: "near",
  symbol: "NEAR",
  name: "NEAR",
  decimals: 24,
  rawBalance: "0",
  amount: 1,
  priceUsd: 1,
  valueUsd: 1,
  change24hPct: null,
  intentsRoutable: true,
  isStablecoin: false,
  wallets: ["a.near"],
  ...p,
});
const snap = (holdings: TokenHolding[]): PortfolioSnapshot => buildSnapshot(holdings, [], { mode: "live", sources: [], generatedAt: "", notes: [] });

describe("risk primitives", () => {
  it("HHI is 1 for a single asset and 1/n for an even split", () => {
    expect(hhi([100])).toBe(1);
    expect(hhi([25, 25, 25, 25])).toBeCloseTo(0.25);
    expect(hhi([])).toBeNull();
  });

  it("volatility is zero for constant prices and needs ≥ 8 points", () => {
    expect(annualisedVolatility(Array(10).fill(5))).toBe(0);
    expect(annualisedVolatility([1, 2, 3])).toBeNull();
    const v = annualisedVolatility([1, 1.1, 1, 1.1, 1, 1.1, 1, 1.1, 1]);
    expect(v).toBeGreaterThan(1); // ~ 0.1 daily → > 100% annualised
  });

  it("max drawdown measures peak-to-trough", () => {
    expect(maxDrawdown([100, 120, 60, 90])).toBeCloseTo(0.5);
    expect(maxDrawdown([1, 2, 3])).toBe(0);
    expect(maxDrawdown([1])).toBeNull();
  });

  it("reconstructs a value series from balances × prices (aligned to newest)", () => {
    const s = reconstructSeries([{ contractId: "a", amount: 2 }, { contractId: "b", amount: 1 }], { a: [1, 2, 3], b: [10, 20] });
    expect(s).toEqual([2 * 2 + 10, 2 * 3 + 20]);
  });

  it("maps scores to levels", () => {
    expect(levelFor(null)).toBe("insufficient-data");
    expect(levelFor(10)).toBe("low");
    expect(levelFor(30)).toBe("moderate");
    expect(levelFor(50)).toBe("elevated");
    expect(levelFor(80)).toBe("high");
  });

  it("weights sum to 1", () => {
    expect(Object.values(WEIGHTS).reduce((s, v) => s + v, 0)).toBeCloseTo(1);
  });
});

describe("analyseRisk", () => {
  it("scores a single-asset portfolio as maximally concentrated", () => {
    const r = analyseRisk({ portfolio: snap([h({ valueUsd: 1000 })]), priceHistory: {}, walletIndicators: [], activityAvailable: false });
    const conc = r.categories.find((c) => c.id === "concentration")!;
    expect(conc.score).toBe(100);
    expect(r.categories.find((c) => c.id === "exposure")!.score).toBe(100);
  });

  it("never invents data: missing inputs yield null categories", () => {
    const r = analyseRisk({ portfolio: snap([h({ valueUsd: 1000 })]), priceHistory: {}, walletIndicators: [], activityAvailable: false });
    expect(r.categories.find((c) => c.id === "volatility")!.score).toBeNull();
    expect(r.categories.find((c) => c.id === "performance")!.score).toBeNull();
    expect(r.categories.find((c) => c.id === "activity")!.score).toBeNull();
    expect(r.categories.find((c) => c.id === "suspicious")!.score).toBeNull();
  });

  it("produces no overall score for an empty portfolio", () => {
    const r = analyseRisk({ portfolio: snap([]), priceHistory: {}, walletIndicators: [], activityAvailable: true });
    expect(r.overallScore).toBeNull();
    expect(r.level).toBe("insufficient-data");
  });

  it("treats staked and non-Intents assets as illiquid", () => {
    const r = analyseRisk({
      portfolio: snap([h({ contractId: "near", valueUsd: 50 }), h({ contractId: "near:staked", valueUsd: 50, intentsRoutable: false })]),
      priceHistory: {},
      walletIndicators: [],
      activityAvailable: false,
    });
    const liq = r.categories.find((c) => c.id === "liquidity")!;
    expect(liq.score).toBe(50);
    expect(liq.inputs.stakedPct).toBe(50);
  });

  it("stablecoin-only portfolios have zero single-token exposure", () => {
    const r = analyseRisk({ portfolio: snap([h({ contractId: "usdc", symbol: "USDC", isStablecoin: true, valueUsd: 100 })]), priceHistory: {}, walletIndicators: [], activityAvailable: false });
    expect(r.categories.find((c) => c.id === "exposure")!.score).toBe(0);
  });

  it("raises suspicious score from risk-list evidence", () => {
    const r = analyseRisk({
      portfolio: snap([h({ valueUsd: 100 })]),
      priceHistory: {},
      walletIndicators: [{ id: "risk-list-interaction", severity: "high", title: "x", evidence: ["e"], heuristic: true }],
      activityAvailable: true,
    });
    expect(r.categories.find((c) => c.id === "suspicious")!.score).toBe(90);
    expect(r.categories.find((c) => c.id === "activity")!.score).toBe(0);
  });

  it("overall score is the weighted mean of available categories", () => {
    const r = analyseRisk({ portfolio: snap([h({ valueUsd: 100 })]), priceHistory: {}, walletIndicators: [], activityAvailable: true });
    const avail = r.categories.filter((c) => c.score !== null);
    const expected = avail.reduce((s, c) => s + (c.score as number) * c.weight, 0) / avail.reduce((s, c) => s + c.weight, 0);
    expect(r.overallScore).toBeCloseTo(expected, 1);
    expect(r.disclaimer).toMatch(/not financial/i);
  });
});

describe("demo data is always labelled", () => {
  it("demo portfolio and risk analysis carry demo provenance", () => {
    expect(demoPortfolio().provenance.mode).toBe("demo");
    const r = demoRiskAnalysis();
    expect(r.provenance.mode).toBe("demo");
    expect(r.provenance.notes.join(" ")).toMatch(/sample/i);
    expect(r.overallScore).not.toBeNull();
  });
});
