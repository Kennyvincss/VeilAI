import { afterEach, describe, expect, it } from "vitest";
import type { NormalizedTx } from "@/types";
import { buildTimeline, computeStats, contractInteractions, largeTransfers, riskIndicators } from "@/lib/wallet-intel/analyze";
import { __resetRiskListForTests } from "@/lib/wallet-intel/known";
import { normalizeFtTxn, normalizeTxn } from "@/lib/blockchain/nearblocks";

const S = "me.near";
let n = 0;
const tx = (p: Partial<NormalizedTx>): NormalizedTx => ({
  hash: `h${n++}`,
  timestamp: "2026-01-01T12:00:00.000Z",
  signer: S,
  receiver: "other.near",
  direction: "out",
  actions: [{ kind: "TRANSFER", depositNear: 0 }],
  depositNear: 0,
  feeNear: 0,
  success: true,
  ...p,
});

afterEach(() => {
  delete process.env.RISK_LIST_JSON;
  __resetRiskListForTests();
});

describe("NearBlocks normalisation", () => {
  it("normalises a txns-only record", () => {
    const t = normalizeTxn(S, {
      signer_account_id: S,
      receiver_account_id: "bob.near",
      transaction_hash: "abc",
      block_timestamp: "1728256282197171397",
      actions: [{ action: "TRANSFER", method: null, deposit: "2000000000000000000000000" }],
      actions_agg: { deposit: "2000000000000000000000000" },
      outcomes: { status: true },
      outcomes_agg: { transaction_fee: "450000000000000000000" },
    });
    expect(t.direction).toBe("out");
    expect(t.depositNear).toBe(2);
    expect(t.feeNear).toBeCloseTo(0.00045);
    expect(t.success).toBe(true);
    expect(t.timestamp.startsWith("2024-10-06")).toBe(true);
  });

  it("handles numeric deposits and incoming direction", () => {
    const t = normalizeTxn(S, { signer_account_id: "bob.near", receiver_account_id: S, transaction_hash: "x", block_timestamp: "1700000000000000000", actions: [{ action: "TRANSFER", method: null, deposit: 1e24 }] });
    expect(t.direction).toBe("in");
    expect(t.depositNear).toBe(1);
  });

  it("normalises FT transfers using token decimals", () => {
    const f = normalizeFtTxn({ event_index: "1", affected_account_id: S, involved_account_id: "bob.near", delta_amount: "-2500000", cause: "TRANSFER", transaction_hash: "t", block_timestamp: "1700000000000000000", ft: { contract: "usdt.tether-token.near", name: "Tether", symbol: "USDt", decimals: 6 } });
    expect(f.delta).toBe(-2.5);
    expect(f.symbol).toBe("USDt");
  });
});

describe("wallet analysis", () => {
  it("computes statistics", () => {
    const txs = [
      tx({ depositNear: 5, timestamp: "2026-01-01T00:00:00Z" }),
      tx({ direction: "in", signer: "bob.near", receiver: S, depositNear: 3, timestamp: "2026-01-03T00:00:00Z" }),
      tx({ success: false, timestamp: "2026-01-03T05:00:00Z" }),
    ];
    const s = computeStats(S, txs, [], 100);
    expect(s.sampledTransactions).toBe(3);
    expect(s.failedTransactions).toBe(1);
    expect(s.nearOut).toBe(5);
    expect(s.nearIn).toBe(3);
    expect(s.activeDays).toBe(2);
    expect(s.uniqueCounterparties).toBe(2);
    expect(s.totalTransactionsIndexed).toBe(100);
  });

  it("builds a sorted daily timeline", () => {
    const t = buildTimeline([tx({ timestamp: "2026-01-02T00:00:00Z" }), tx({ timestamp: "2026-01-01T00:00:00Z" }), tx({ timestamp: "2026-01-02T03:00:00Z" })]);
    expect(t.map((d) => [d.date, d.count])).toEqual([
      ["2026-01-01", 1],
      ["2026-01-02", 2],
    ]);
  });

  it("collects contract interactions and large transfers", () => {
    const txs = [tx({ receiver: "v2.ref-finance.near", actions: [{ kind: "FUNCTION_CALL", method: "swap", depositNear: 0 }] }), tx({ depositNear: 1500 })];
    expect(contractInteractions(S, txs)[0]).toEqual({ contract: "v2.ref-finance.near", methods: ["swap"], calls: 1 });
    expect(largeTransfers(S, txs, [])).toHaveLength(1);
  });

  it("reports 'no indicators' rather than inventing risk", () => {
    const txs = [tx({})];
    const ind = riskIndicators(S, txs, [], computeStats(S, txs, [], null), 10);
    expect(ind).toHaveLength(1);
    expect(ind[0].id).toBe("none");
    expect(ind[0].evidence.join(" ")).toMatch(/not proof of safety/i);
  });

  it("flags risk-list interactions only with a sourced list entry", () => {
    const txs = [tx({ receiver: "bad.near" })];
    expect(riskIndicators(S, txs, [], computeStats(S, txs, [], null), 1).some((i) => i.id === "risk-list-interaction")).toBe(false);
    process.env.RISK_LIST_JSON = JSON.stringify([{ account: "bad.near", reason: "reported exploit", source: "https://example.org/report" }]);
    __resetRiskListForTests();
    const ind = riskIndicators(S, txs, [], computeStats(S, txs, [], null), 1);
    const hit = ind.find((i) => i.id === "risk-list-interaction")!;
    expect(hit.evidence[0]).toContain("https://example.org/report");
    expect(hit.heuristic).toBe(true);
  });

  it("ignores risk-list entries without an http(s) source", () => {
    process.env.RISK_LIST_JSON = JSON.stringify([{ account: "bad.near", reason: "rumour", source: "trust me" }]);
    __resetRiskListForTests();
    const txs = [tx({ receiver: "bad.near" })];
    expect(riskIndicators(S, txs, [], computeStats(S, txs, [], null), 1).some((i) => i.id === "risk-list-interaction")).toBe(false);
  });

  it("detects a high failed-transaction ratio", () => {
    const txs = Array.from({ length: 10 }, (_, i) => tx({ success: i < 5 ? false : true }));
    const ind = riskIndicators(S, txs, [], computeStats(S, txs, [], null), 10);
    expect(ind.find((i) => i.id === "failed-ratio")?.severity).toBe("medium");
  });
});
