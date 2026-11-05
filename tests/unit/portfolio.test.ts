import { describe, expect, it } from "vitest";
import type { TokenHolding } from "@/types";
import { allocation, buildSnapshot, mergeHoldings, portfolioChange24h, valueOf } from "@/lib/portfolio/compute";
import { nanosToIso, rawToNumber, yoctoToNear } from "@/lib/utils/units";

const h = (p: Partial<TokenHolding>): TokenHolding => ({
  contractId: "near",
  symbol: "NEAR",
  name: "NEAR",
  decimals: 24,
  rawBalance: "0",
  amount: 0,
  priceUsd: null,
  valueUsd: null,
  change24hPct: null,
  intentsRoutable: true,
  isStablecoin: false,
  wallets: ["a.near"],
  ...p,
});

describe("unit conversion", () => {
  it("converts yoctoNEAR exactly", () => {
    expect(yoctoToNear("1000000000000000000000000")).toBe(1);
    expect(yoctoToNear("1500000000000000000000000")).toBe(1.5);
    expect(yoctoToNear("123456789000000000000000000000")).toBe(123456.789);
    expect(yoctoToNear("0")).toBe(0);
  });
  it("handles decimals, negatives and garbage", () => {
    expect(rawToNumber("1234567", 6)).toBeCloseTo(1.234567);
    expect(rawToNumber("-2500000", 6)).toBe(-2.5);
    expect(rawToNumber("not-a-number", 6)).toBe(0);
    expect(rawToNumber(null, 6)).toBe(0);
    expect(rawToNumber("42", 0)).toBe(42);
  });
  it("converts nanosecond timestamps", () => {
    expect(nanosToIso("1728256282197171397")).toBe("2024-10-06T23:11:22.197Z");
    expect(nanosToIso(null)).toBe(new Date(0).toISOString());
  });
});

describe("portfolio calculations", () => {
  it("values holdings and handles missing prices", () => {
    expect(valueOf(10, 2.5)).toBe(25);
    expect(valueOf(10, null)).toBeNull();
  });

  it("merges the same asset across wallets", () => {
    const merged = mergeHoldings([
      h({ amount: 1, rawBalance: "1000", valueUsd: 3, wallets: ["a.near"] }),
      h({ amount: 2, rawBalance: "2000", valueUsd: 6, wallets: ["b.near"] }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].amount).toBe(3);
    expect(merged[0].rawBalance).toBe("3000");
    expect(merged[0].valueUsd).toBe(9);
    expect(merged[0].wallets).toEqual(["a.near", "b.near"]);
  });

  it("computes value-weighted 24h change", () => {
    // 110 now after +10% (was 100); 90 now after -10% (was 100) → 200 vs 200 = 0%
    const r = portfolioChange24h([h({ contractId: "a", valueUsd: 110, change24hPct: 10 }), h({ contractId: "b", valueUsd: 90, change24hPct: -10 })]);
    expect(r.pct).toBeCloseTo(0, 10);
    expect(r.usd).toBeCloseTo(0, 10);
    const up = portfolioChange24h([h({ valueUsd: 110, change24hPct: 10 })]);
    expect(up.pct).toBeCloseTo(10);
    expect(up.usd).toBeCloseTo(10);
  });

  it("returns null change when no data is available", () => {
    expect(portfolioChange24h([h({ valueUsd: 100, change24hPct: null })])).toEqual({ pct: null, usd: null });
  });

  it("builds allocation with an Other bucket and excludes unpriced", () => {
    const list = Array.from({ length: 8 }, (_, i) => h({ contractId: `t${i}`, symbol: `T${i}`, valueUsd: 10 }));
    list.push(h({ contractId: "spam", symbol: "SPAM", valueUsd: null }));
    const a = allocation(list, 6);
    expect(a).toHaveLength(7);
    expect(a[6].symbol).toBe("Other");
    expect(a.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100);
    expect(a.find((r) => r.symbol === "SPAM")).toBeUndefined();
  });

  it("combines liquid + staked NEAR into one allocation slice", () => {
    const a = allocation([h({ contractId: "near", valueUsd: 30 }), h({ contractId: "near:staked", valueUsd: 70 })]);
    expect(a).toEqual([{ symbol: "NEAR", valueUsd: 100, pct: 100 }]);
  });

  it("builds a snapshot with totals and unpriced count", () => {
    const s = buildSnapshot([h({ valueUsd: 50 }), h({ contractId: "x", symbol: "X", valueUsd: null })], [], { mode: "live", sources: [], generatedAt: "", notes: [] });
    expect(s.totalValueUsd).toBe(50);
    expect(s.unpricedAssets).toBe(1);
    expect(s.provenance.mode).toBe("live");
  });
});
