import { describe, expect, it } from "vitest";
import { describeAction, parseAction } from "@/lib/ai/actions";
import { lowestFeeValidator } from "@/components/wallet/action-card";

describe("parseAction (user's own words only)", () => {
  it("parses sends", () => {
    expect(parseAction("Send 5 NEAR to bob.near")).toEqual({ kind: "send", amount: "5", token: "NEAR", to: "bob.near" });
    expect(parseAction("please transfer 2.5 usdc to alice.near now")).toEqual({ kind: "send", amount: "2.5", token: "USDC", to: "alice.near" });
    expect(parseAction("pay carol.near 0,5 near")).toEqual({ kind: "send", amount: "0.5", token: "NEAR", to: "carol.near" });
    expect(parseAction("send 3 NEAR to @alice_99")).toBeNull();
    const implicit = "a".repeat(64);
    expect(parseAction(`send .1 near to ${implicit}`)).toMatchObject({ amount: "0.1", to: implicit });
  });
  it("parses stake and unstake", () => {
    expect(parseAction("Stake 5 NEAR with the lowest-fee validator")).toEqual({ kind: "stake", amount: "5", pool: null, lowestFee: true });
    expect(parseAction("stake 10 near with astro-stakers.poolv1.near")).toEqual({ kind: "stake", amount: "10", pool: "astro-stakers.poolv1.near", lowestFee: false });
    expect(parseAction("stake 3 near")).toEqual({ kind: "stake", amount: "3", pool: null, lowestFee: false });
    expect(parseAction("unstake 2 NEAR from figment.poolv1.near")).toEqual({ kind: "unstake", amount: "2", pool: "figment.poolv1.near" });
  });
  it("parses swaps", () => {
    expect(parseAction("swap 2 NEAR to USDC")).toEqual({ kind: "swap", amount: "2", from: "NEAR", to: "USDC" });
    expect(parseAction("convert 100 usdt into near")).toEqual({ kind: "swap", amount: "100", from: "USDT", to: "NEAR" });
    expect(parseAction("swap 2 near to near")).toBeNull();
  });
  it("ignores questions without a concrete action", () => {
    for (const q of ["What are my biggest risks?", "Should I stake more?", "send me a report", "how do swaps work", "send 5 near to bob"]) expect(parseAction(q)).toBeNull();
  });
  it("describes actions for the model", () => {
    expect(describeAction({ kind: "stake", amount: "5", pool: null, lowestFee: true })).toBe("stake 5 NEAR with the lowest-fee validator");
  });
});

describe("lowestFeeValidator", () => {
  it("picks the lowest fee, breaking ties by stake, skipping unknown fees", () => {
    expect(
      lowestFeeValidator([
        { poolId: "a", stakeNear: 10, feePct: 5 },
        { poolId: "b", stakeNear: 5, feePct: 1 },
        { poolId: "c", stakeNear: 50, feePct: 1 },
        { poolId: "d", stakeNear: 99, feePct: null },
      ])?.poolId,
    ).toBe("c");
    expect(lowestFeeValidator([{ poolId: "d", stakeNear: 1, feePct: null }])).toBeNull();
  });
});
