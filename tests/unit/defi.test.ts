import { describe, expect, it } from "vitest";
import { AmountError, fromBaseUnits, GAS_RESERVE_YOCTO, spendableYocto, toBaseUnits } from "@/lib/defi/amounts";
import { attachedYocto, depositAndStake, ftTransfer, nativeTransfer, storageDeposit, swapDeposit, unstake, withdrawAll } from "@/lib/defi/transactions";

const NEAR = BigInt("1000000000000000000000000");

describe("exact amount conversion", () => {
  it("converts decimals to base units without floating point", () => {
    expect(toBaseUnits("1", 24)).toBe("1000000000000000000000000");
    expect(toBaseUnits("1.5", 24)).toBe("1500000000000000000000000");
    expect(toBaseUnits("0.000000000000000000000001", 24)).toBe("1");
    expect(toBaseUnits("123456789.123456", 6)).toBe("123456789123456");
    expect(toBaseUnits(".5", 6)).toBe("500000");
    expect(toBaseUnits("1,000", 0)).toBe("1000");
    // A value that is inexact in floating point stays exact here.
    expect(toBaseUnits("0.1", 18)).toBe("100000000000000000");
  });
  it("rejects invalid, zero, negative and over-precise amounts", () => {
    for (const bad of ["", ".", "abc", "-1", "1e5", "0", "0.000", "1.2.3"]) expect(() => toBaseUnits(bad, 6)).toThrow(AmountError);
    expect(() => toBaseUnits("1.1234567", 6)).toThrow(/decimal places/);
  });
  it("formats base units back to decimals", () => {
    expect(fromBaseUnits("1500000000000000000000000", 24)).toBe("1.5");
    expect(fromBaseUnits("1", 24)).toBe("0.000000000000000000000001");
    expect(fromBaseUnits("1234567", 6, 2)).toBe("1.23");
    expect(fromBaseUnits("0", 6)).toBe("0");
  });
  it("round-trips", () => {
    for (const v of ["1", "0.5", "42.123456", "0.000001"]) expect(fromBaseUnits(toBaseUnits(v, 6), 6)).toBe(v);
  });
});

describe("spendable NEAR", () => {
  it("subtracts storage-locked NEAR and a gas reserve", () => {
    // 10 NEAR, 1000 bytes of storage (0.01 NEAR) and 0.05 NEAR reserve.
    expect(spendableYocto((BigInt(10) * NEAR).toString(), 1000)).toBe(BigInt(10) * NEAR - BigInt("10000000000000000000000") - GAS_RESERVE_YOCTO);
  });
  it("never goes negative", () => {
    expect(spendableYocto("1000", 500)).toBe(BigInt(0));
  });
});

describe("transaction builders", () => {
  it("native transfer", () => {
    expect(nativeTransfer("bob.near", "5")).toEqual({ receiverId: "bob.near", actions: [{ type: "Transfer", params: { deposit: "5" } }] });
  });
  it("ft_transfer attaches exactly 1 yoctoNEAR and 30 Tgas", () => {
    const t = ftTransfer("usdt.tether-token.near", "bob.near", "1000000", "hi");
    expect(t.receiverId).toBe("usdt.tether-token.near");
    expect(t.actions[0]).toEqual({ type: "FunctionCall", params: { methodName: "ft_transfer", args: { receiver_id: "bob.near", amount: "1000000", memo: "hi" }, gas: "30000000000000", deposit: "1" } });
  });
  it("storage_deposit registers only", () => {
    const t = storageDeposit("token.near", "bob.near");
    expect(t.actions[0].params).toMatchObject({ methodName: "storage_deposit", args: { account_id: "bob.near", registration_only: true }, deposit: "1250000000000000000000" });
  });
  it("staking calls follow the core staking-pool interface", () => {
    expect(depositAndStake("x.poolv1.near", "7").actions[0].params).toMatchObject({ methodName: "deposit_and_stake", deposit: "7", gas: "125000000000000" });
    expect(unstake("x.poolv1.near", "7").actions[0].params).toMatchObject({ methodName: "unstake", args: { amount: "7" }, deposit: "0" });
    expect(withdrawAll("x.poolv1.near").actions[0].params).toMatchObject({ methodName: "withdraw_all", deposit: "0" });
  });
  it("swap deposit: native NEAR is a plain transfer; tokens register then transfer", () => {
    expect(swapDeposit({ originContract: "near", isNative: true, depositAddress: "a".repeat(64), amountRaw: "9" })).toEqual([nativeTransfer("a".repeat(64), "9")]);
    const ft = swapDeposit({ originContract: "usdc.near", isNative: false, depositAddress: "dep", amountRaw: "9" });
    expect(ft.map((t) => (t.actions[0].type === "FunctionCall" ? t.actions[0].params.methodName : "transfer"))).toEqual(["storage_deposit", "ft_transfer"]);
    expect(ft.every((t) => t.receiverId === "usdc.near")).toBe(true);
  });
  it("sums attached deposits", () => {
    expect(attachedYocto([nativeTransfer("a.near", "10"), ftTransfer("t.near", "b.near", "5")])).toBe(BigInt(11));
  });
});
