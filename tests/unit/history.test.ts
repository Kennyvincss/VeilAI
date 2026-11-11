import { describe, expect, it } from "vitest";
import type { NormalizedFtTransfer, NormalizedTx } from "@/types";
import { buildActivity, describeTx } from "@/lib/defi/history";

const tx = (over: Partial<NormalizedTx>): NormalizedTx => ({
  hash: "h1",
  timestamp: "2026-11-10T10:00:00.000Z",
  signer: "me.near",
  receiver: "bob.near",
  direction: "out",
  actions: [{ kind: "TRANSFER", depositNear: 2 }],
  depositNear: 2,
  feeNear: 0,
  success: true,
  ...over,
});

describe("wallet activity", () => {
  it("describes transfers and staking in plain language", () => {
    expect(describeTx("me.near", tx({}))).toMatchObject({ kind: "sent", title: "Sent to bob.near", amount: "−2 NEAR" });
    expect(describeTx("me.near", tx({ signer: "bob.near", receiver: "me.near", direction: "in" }))).toMatchObject({ kind: "received", amount: "+2 NEAR" });
    expect(describeTx("me.near", tx({ receiver: "x.poolv1.near", actions: [{ kind: "FUNCTION_CALL", method: "deposit_and_stake", depositNear: 5 }], depositNear: 5 }))).toMatchObject({ kind: "stake", title: "Staked with x.poolv1.near", amount: "5 NEAR" });
  });
  it("replaces generic token-call rows with the token transfer, newest first", () => {
    const ftCall = tx({ hash: "h2", timestamp: "2026-11-10T11:00:00.000Z", receiver: "usdc.near", actions: [{ kind: "FUNCTION_CALL", method: "ft_transfer", depositNear: 0 }], depositNear: 0 });
    const ft: NormalizedFtTransfer = { hash: "h2", timestamp: "2026-11-10T11:00:00.000Z", contractId: "usdc.near", symbol: "USDC", decimals: 6, delta: -2.5, counterparty: "bob.near", cause: "TRANSFER" };
    const items = buildActivity("me.near", [tx({}), ftCall], [ft]);
    expect(items.map((i) => i.title)).toEqual(["Sent USDC to bob.near", "Sent to bob.near"]);
    expect(items[0].amount).toBe("−2.5 USDC");
  });
});
