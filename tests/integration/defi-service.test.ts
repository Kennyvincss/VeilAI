import { beforeEach, describe, expect, it, vi } from "vitest";

/** DeFi service safety checks, with the chain and NEAR Intents mocked. */
const chain = {
  accounts: new Map<string, { amount: string; storage_usage: number; isContract: boolean } | null>(),
  ftBalance: "0",
  storage: null as null | { total: string; available: string },
  pool: null as null | { account_id: string; staked_balance: string; unstaked_balance: string; can_withdraw: boolean },
  fee: { numerator: 5, denominator: 100 } as null | { numerator: number; denominator: number },
};
const NEAR = "1000000000000000000000000";

vi.mock("@/lib/near/rpc", () => ({
  viewAccount: vi.fn(async (id: string) => (chain.accounts.has(id) ? chain.accounts.get(id) : null)),
  ftMetadata: vi.fn(async () => ({ spec: "ft-1.0.0", name: "USD Coin", symbol: "USDC", icon: null, decimals: 6 })),
  ftBalanceOf: vi.fn(async () => chain.ftBalance),
  storageBalanceOf: vi.fn(async () => chain.storage),
  storageBalanceBounds: vi.fn(async () => ({ min: "1250000000000000000000", max: null })),
  poolAccount: vi.fn(async () => chain.pool),
  poolFee: vi.fn(async () => chain.fee),
  currentValidators: vi.fn(async () => []),
}));
vi.mock("@/lib/blockchain/fastnear", () => ({ accountStakingPools: vi.fn(async () => []) }));
const history = { receiver: [] as unknown[], sender: [] as unknown[] };
vi.mock("@/lib/blockchain/nearblocks", async (orig) => ({
  ...(await orig<typeof import("@/lib/blockchain/nearblocks")>()),
  accountTransactions: vi.fn(async (id: string) => (id === "me.near" ? history.sender : history.receiver)),
  accountFtTransfers: vi.fn(async () => []),
}));
vi.mock("@/lib/portfolio/service", () => ({ fetchLivePortfolio: vi.fn(async () => null) }));

const intents = [
  { assetId: "nep141:wrap.near", decimals: 24, blockchain: "near", symbol: "wNEAR", price: 3, priceUpdatedAt: "", contractAddress: "wrap.near" },
  { assetId: "nep141:usdc.near", decimals: 6, blockchain: "near", symbol: "USDC", price: 1, priceUpdatedAt: "", contractAddress: "usdc.near" },
];
vi.mock("@/lib/blockchain/prices", async (orig) => ({ ...(await orig<typeof import("@/lib/blockchain/prices")>()), intentsTokens: vi.fn(async () => intents) }));

const quote = { response: null as unknown };
vi.mock("@/lib/defi/oneclick", () => ({ requestQuote: vi.fn(async () => quote.response) }));

import { DefiError, prepareSend, prepareStake, prepareSwap, prepareUnstake, prepareWithdraw, stakingPositions } from "@/lib/defi/service";

function q(over: Record<string, unknown> = {}, reqOver: Record<string, unknown> = {}) {
  return {
    correlationId: "c",
    timestamp: "",
    signature: "",
    quoteRequest: { recipient: "me.near", refundTo: "me.near", originAsset: "nep141:wrap.near", destinationAsset: "nep141:usdc.near", slippageTolerance: 100, ...reqOver },
    quote: { amountIn: "2" + "0".repeat(24), amountInFormatted: "2", amountInUsd: "6", minAmountIn: "0", amountOut: "6000000", amountOutFormatted: "6", amountOutUsd: "6", minAmountOut: "5900000", timeEstimate: 10, depositAddress: "d".repeat(64), ...over },
  };
}

beforeEach(() => {
  chain.accounts = new Map([
    ["me.near", { amount: (BigInt(10) * BigInt(NEAR)).toString(), storage_usage: 1000, isContract: false }],
    ["bob.near", { amount: NEAR, storage_usage: 100, isContract: false }],
  ]);
  chain.ftBalance = "0";
  chain.storage = null;
  chain.pool = null;
  chain.fee = { numerator: 5, denominator: 100 };
  history.receiver = [nbTx("bob.near", "carol.near", 30)];
  history.sender = [];
});

function nbTx(signer: string, receiver: string, daysAgo: number) {
  return {
    transaction_hash: `h${Math.random()}`,
    block_timestamp: String((Date.now() - daysAgo * 86_400_000) * 1_000_000),
    predecessor_account_id: signer,
    receiver_account_id: receiver,
    actions: [{ action: "TRANSFER", method: null, deposit: 1 }],
    actions_agg: { deposit: 1 },
    outcomes: { status: true },
    outcomes_agg: { transaction_fee: 0 },
  };
}

describe("prepareSend", () => {
  it("builds a native transfer within the spendable balance", async () => {
    const plan = await prepareSend({ from: "me.near", to: "bob.near", token: "near", amount: "1.5" });
    expect(plan.transactions).toEqual([{ receiverId: "bob.near", actions: [{ type: "Transfer", params: { deposit: "1500000000000000000000000" } }] }]);
    expect(plan.review.find((r) => r.label === "Send")?.value).toBe("1.5 NEAR");
  });
  it("refuses to send more than is spendable", async () => {
    await expect(prepareSend({ from: "me.near", to: "bob.near", token: "near", amount: "9.99" })).rejects.toThrow(/Insufficient balance/);
  });
  it("refuses unknown receivers and self-sends", async () => {
    await expect(prepareSend({ from: "me.near", to: "nobody.near", token: "near", amount: "1" })).rejects.toThrow(/does not exist/);
    await expect(prepareSend({ from: "me.near", to: "me.near", token: "near", amount: "1" })).rejects.toThrow(/same account/);
  });
  it("allows NEAR (only) to a new implicit account", async () => {
    const implicit = "a".repeat(64);
    const plan = await prepareSend({ from: "me.near", to: implicit, token: "near", amount: "1" });
    expect(plan.warnings.join(" ")).toMatch(/create it/);
    await expect(prepareSend({ from: "me.near", to: implicit, token: "usdc.near", amount: "1" })).rejects.toThrow(/does not exist/);
  });
  it("registers the receiver for the token when needed, then transfers", async () => {
    chain.ftBalance = "5000000";
    const plan = await prepareSend({ from: "me.near", to: "bob.near", token: "usdc.near", amount: "2.5" });
    expect(plan.transactions.map((t) => (t.actions[0].type === "FunctionCall" ? t.actions[0].params.methodName : ""))).toEqual(["storage_deposit", "ft_transfer"]);
    const ft = plan.transactions[1].actions[0];
    expect(ft.type === "FunctionCall" && ft.params.args).toEqual({ receiver_id: "bob.near", amount: "2500000" });
  });
  it("skips registration when the receiver is already registered", async () => {
    chain.ftBalance = "5000000";
    chain.storage = { total: "1", available: "0" };
    const plan = await prepareSend({ from: "me.near", to: "bob.near", token: "usdc.near", amount: "1" });
    expect(plan.transactions).toHaveLength(1);
  });
  it("runs a receiver safety check and flags first-time sends", async () => {
    const plan = await prepareSend({ from: "me.near", to: "bob.near", token: "near", amount: "1" });
    expect(plan.safety?.findings.map((f) => f.id)).toContain("first-time");
  });
  it("flags a look-alike of an account the user sent to before", async () => {
    chain.accounts.set("bob1.near", { amount: NEAR, storage_usage: 100, isContract: false });
    history.sender = [nbTx("me.near", "bob.near", 3)];
    const plan = await prepareSend({ from: "me.near", to: "bob1.near", token: "near", amount: "1" });
    expect(plan.safety?.level).toBe("danger");
    expect(plan.safety?.findings[0].detail).toMatch(/bob\.near/);
  });
  it("flags sending a token to its own contract", async () => {
    chain.accounts.set("usdc.near", { amount: NEAR, storage_usage: 100, isContract: true });
    chain.ftBalance = "5000000";
    chain.storage = { total: "1", available: "0" };
    const plan = await prepareSend({ from: "me.near", to: "usdc.near", token: "usdc.near", amount: "1" });
    expect(plan.safety?.findings[0].id).toBe("token-to-own-contract");
  });
  it("refuses more tokens than the balance", async () => {
    chain.ftBalance = "1000000";
    await expect(prepareSend({ from: "me.near", to: "bob.near", token: "usdc.near", amount: "2" })).rejects.toThrow(/Insufficient USDC/);
  });
});

describe("staking", () => {
  it("requires a real pool, at least 1 NEAR and enough balance", async () => {
    await expect(prepareStake({ from: "me.near", pool: "x.poolv1.near", amount: "0.5" })).rejects.toThrow(/minimum stake/);
    await expect(prepareStake({ from: "me.near", pool: "x.poolv1.near", amount: "50" })).rejects.toThrow(/Insufficient/);
    await expect(prepareStake({ from: "me.near", pool: "evil.near", amount: "2" })).rejects.toThrow(/official NEAR staking-pool factory/);
    await expect(prepareUnstake({ from: "me.near", pool: "evil.near", amount: "2" })).rejects.toThrow(/official/);
    chain.fee = null;
    await expect(prepareStake({ from: "me.near", pool: "fake.poolv1.near", amount: "2" })).rejects.toThrow(/not a valid staking pool/);
  });
  it("builds deposit_and_stake and shows the validator fee", async () => {
    const plan = await prepareStake({ from: "me.near", pool: "x.poolv1.near", amount: "2" });
    expect(plan.transactions[0].receiverId).toBe("x.poolv1.near");
    expect(plan.review.find((r) => r.label === "Validator fee")?.value).toBe("5% of rewards");
    expect(plan.warnings.join(" ")).toMatch(/2–3 days/);
  });
  it("finds a fresh stake from recent transactions even before the index has it", async () => {
    history.sender = [nbTx("me.near", "x.poolv1.near", 0)];
    chain.pool = { account_id: "me.near", staked_balance: "2" + "0".repeat(24), unstaked_balance: "0", can_withdraw: false };
    const positions = await stakingPositions("me.near");
    expect(positions.map((p) => p.poolId)).toEqual(["x.poolv1.near"]);
    expect(positions[0]).toMatchObject({ staked: "2", stakedExact: "2" });
  });
  it("only withdraws when unstaked NEAR is available", async () => {
    chain.pool = { account_id: "me.near", staked_balance: "0", unstaked_balance: NEAR, can_withdraw: false };
    await expect(prepareWithdraw({ from: "me.near", pool: "x.poolv1.near" })).rejects.toThrow(/isn't withdrawable yet/);
    chain.pool.can_withdraw = true;
    expect((await prepareWithdraw({ from: "me.near", pool: "x.poolv1.near" })).transactions[0].actions[0].type).toBe("FunctionCall");
  });
});

describe("prepareSwap (NEAR Intents)", () => {
  const base = { from: "me.near", originAssetId: "nep141:wrap.near", destinationAssetId: "nep141:usdc.near", amount: "2", slippageBps: 100 };

  it("dry quote returns no transactions", async () => {
    quote.response = q();
    const r = await prepareSwap({ ...base, dry: true });
    expect(r.plan).toBeNull();
  });
  it("native NEAR deposit is a plain transfer to the quote's deposit address", async () => {
    quote.response = q();
    const r = await prepareSwap({ ...base, dry: false });
    expect(r.plan?.transactions).toEqual([{ receiverId: "d".repeat(64), actions: [{ type: "Transfer", params: { deposit: "2" + "0".repeat(24) } }] }]);
  });
  it("rejects a quote that would send funds to someone else", async () => {
    quote.response = q({}, { recipient: "attacker.near" });
    await expect(prepareSwap({ ...base, dry: false })).rejects.toThrow(DefiError);
    quote.response = q({}, { refundTo: "attacker.near" });
    await expect(prepareSwap({ ...base, dry: false })).rejects.toThrow(/did not match/);
  });
  it("rejects a quote asking for more than approved, or without a deposit address", async () => {
    quote.response = q({ amountIn: "3" + "0".repeat(24) });
    await expect(prepareSwap({ ...base, dry: false })).rejects.toThrow(/did not match/);
    quote.response = q({ amountIn: "1" + "0".repeat(24) });
    await expect(prepareSwap({ ...base, dry: false })).rejects.toThrow(/did not match/);
    quote.response = q({ depositAddress: undefined });
    await expect(prepareSwap({ ...base, dry: false })).rejects.toThrow(/deposit address/);
  });
  it("rejects a quote for different tokens, looser slippage or an invalid deposit address", async () => {
    quote.response = q({}, { destinationAsset: "nep141:scam.near" });
    await expect(prepareSwap({ ...base, dry: false })).rejects.toThrow(/did not match/);
    quote.response = q({}, { slippageTolerance: 5000 });
    await expect(prepareSwap({ ...base, dry: false })).rejects.toThrow(/did not match/);
    quote.response = q({ depositAddress: "Not An Account!" });
    await expect(prepareSwap({ ...base, dry: false })).rejects.toThrow(/did not match/);
  });
  it("checks the balance and refuses same-token or unsupported swaps", async () => {
    await expect(prepareSwap({ ...base, amount: "100", dry: true })).rejects.toThrow(/Insufficient/);
    await expect(prepareSwap({ ...base, destinationAssetId: base.originAssetId, dry: true })).rejects.toThrow(/two different/);
    await expect(prepareSwap({ ...base, destinationAssetId: "nep141:scam.near", dry: true })).rejects.toThrow(/isn't supported/);
  });
});
