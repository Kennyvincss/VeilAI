import "server-only";
import { accountKind, isValidAccountId } from "@/lib/near/account";
import {
  currentValidators,
  ftBalanceOf,
  ftMetadata,
  poolAccount,
  poolFee,
  rewardInputs,
  storageBalanceBounds,
  storageBalanceOf,
  viewAccount,
} from "@/lib/near/rpc";
import { accountStakingPools } from "@/lib/blockchain/fastnear";
import { indexNearTokens, intentsTokens, type IntentsToken } from "@/lib/blockchain/prices";
import { fetchLivePortfolio } from "@/lib/portfolio/service";
import { AmountError, fromBaseUnits, NEAR_DECIMALS, spendableYocto, toBaseUnits } from "@/lib/defi/amounts";
import {
  DEFAULT_FT_STORAGE_DEPOSIT,
  depositAndStake,
  ftTransfer,
  nativeTransfer,
  storageDeposit,
  swapDeposit,
  unstake,
  withdrawAll,
  type TransactionPlan,
} from "@/lib/defi/transactions";
import { requestQuote, type OneClickQuoteResponse } from "@/lib/defi/oneclick";
import { accountFtTransfers, accountTransactions, normalizeFtTxn, normalizeTxn } from "@/lib/blockchain/nearblocks";
import { analyzeRecipient, type SafetyCheck } from "@/lib/defi/recipient-check";
import { yoctoToNear } from "@/lib/utils/units";

/** A validation failure with a message that is safe to show the user. */
export class DefiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const fmtNear = (yocto: string | bigint) => `${fromBaseUnits(yocto, NEAR_DECIMALS, 5)} NEAR`;

function parse(amount: string, decimals: number): string {
  try {
    return toBaseUnits(amount, decimals);
  } catch (err) {
    throw new DefiError(err instanceof AmountError ? err.message : "Enter a valid amount");
  }
}

async function requireAccount(accountId: string) {
  const acct = await viewAccount(accountId).catch(() => undefined);
  if (acct === undefined) throw new DefiError("The NEAR network could not be reached. Please try again.", 502);
  if (acct === null) throw new DefiError(`Account ${accountId} does not exist on NEAR.`, 404);
  return acct;
}

/** Resolves to null instead of waiting longer than `ms` or throwing. */
function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

const SAFETY_SAMPLE = 25;

/** Gathers public facts about the receiver (fail-soft, ~6s budget) and analyses them. */
export async function recipientSafety(params: {
  from: string;
  to: string;
  tokenContract: string | null;
  receiver: { amount: string; isContract: boolean } | null;
  contacts?: string[];
}): Promise<SafetyCheck> {
  const [rtx, rft, stx, tokens] = await Promise.all([
    params.receiver ? within(accountTransactions(params.to, SAFETY_SAMPLE), 6000) : Promise.resolve([]),
    params.receiver ? within(accountFtTransfers(params.to, SAFETY_SAMPLE), 6000) : Promise.resolve([]),
    within(accountTransactions(params.from, 50), 6000),
    within(intentsTokens(), 4000),
  ]);
  return analyzeRecipient({
    from: params.from,
    to: params.to,
    tokenContract: params.tokenContract,
    receiverIsContract: params.receiver?.isContract ?? false,
    receiverBalanceNear: params.receiver ? yoctoToNear(params.receiver.amount) : null,
    receiverTxs: rtx ? rtx.map((t) => normalizeTxn(params.to, t)) : null,
    receiverFts: rft ? rft.map(normalizeFtTxn) : null,
    sampleSize: SAFETY_SAMPLE,
    senderTxs: stx ? stx.map((t) => normalizeTxn(params.from, t)) : null,
    contacts: params.contacts,
    knownTokenContracts: (tokens ?? []).filter((t) => t.blockchain === "near" && t.contractAddress).map((t) => t.contractAddress as string),
  });
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export async function walletOverview(accountId: string) {
  const acct = await requireAccount(accountId);
  const portfolio = await fetchLivePortfolio([{ accountId }]).catch(() => null);
  const spendable = spendableYocto(acct.amount, acct.storage_usage);
  const tokens = (portfolio?.holdings ?? [])
    .filter((h) => h.contractId !== "near" && h.contractId !== "near:staked" && h.rawBalance !== "0")
    .map((h) => ({
      contractId: h.contractId,
      symbol: h.symbol,
      name: h.name,
      decimals: h.decimals,
      rawBalance: h.rawBalance,
      amount: h.amount,
      priceUsd: h.priceUsd,
      valueUsd: h.valueUsd,
      icon: h.icon ?? null,
    }));
  const nearHolding = portfolio?.holdings.find((h) => h.contractId === "near");
  const positions = await stakingPositions(accountId).catch(() => null);
  const sum = (key: "stakedYocto" | "unstakedYocto") => (positions ?? []).reduce((t, p) => t + BigInt(p[key]), BigInt(0));
  return {
    accountId,
    near: {
      totalYocto: acct.amount,
      spendableYocto: spendable.toString(),
      spendable: fromBaseUnits(spendable, NEAR_DECIMALS, 5),
      lockedForStorage: fromBaseUnits(BigInt(acct.storage_usage) * BigInt("10000000000000000000"), NEAR_DECIMALS, 5),
      priceUsd: nearHolding?.priceUsd ?? null,
    },
    tokens,
    totalValueUsd: portfolio?.totalValueUsd ?? null,
    staking: positions
      ? {
          staked: fromBaseUnits(sum("stakedYocto"), NEAR_DECIMALS, 4),
          unstaked: fromBaseUnits(sum("unstakedYocto"), NEAR_DECIMALS, 4),
          withdrawable: positions.some((p) => p.canWithdraw && p.unstakedYocto !== "0"),
          pools: positions.length,
        }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* Send                                                                */
/* ------------------------------------------------------------------ */

export async function prepareSend(input: { from: string; to: string; token: string; amount: string; memo?: string | null; contacts?: string[] }): Promise<TransactionPlan> {
  const { from, to, token } = input;
  if (from === to) throw new DefiError("You can't send to the same account.");
  const sender = await requireAccount(from);

  // Receiver must exist, except implicit (64-hex) accounts which a NEAR transfer creates.
  const receiver = await viewAccount(to).catch(() => undefined);
  if (receiver === undefined) throw new DefiError("The NEAR network could not be reached. Please try again.", 502);
  const implicitNew = receiver === null && accountKind(to) === "implicit";
  if (receiver === null && !(implicitNew && token === "near")) throw new DefiError(`Account ${to} does not exist on NEAR. Check the address.`);

  const warnings: string[] = ["Blockchain transfers are final. Double-check the receiving account."];
  if (implicitNew) warnings.push("This is a new implicit account: the transfer will create it.");

  const safetyPromise = recipientSafety({ from, to, tokenContract: token === "near" ? null : token, receiver, contacts: input.contacts });

  if (token === "near") {
    const raw = parse(input.amount, NEAR_DECIMALS);
    const spendable = spendableYocto(sender.amount, sender.storage_usage);
    if (BigInt(raw) > spendable) throw new DefiError(`Insufficient balance. You can send up to ${fmtNear(spendable)} (a small amount is kept for storage and fees).`);
    return {
      kind: "send",
      transactions: [nativeTransfer(to, raw)],
      review: [
        { label: "Send", value: fmtNear(raw) },
        { label: "To", value: to },
        { label: "From", value: from },
        { label: "Network fee", value: "≈ 0.0001 NEAR (paid by your wallet)" },
      ],
      warnings,
      safety: await safetyPromise,
    };
  }

  const meta = await ftMetadata(token);
  if (!meta) throw new DefiError("This token could not be read from the blockchain.");
  const raw = parse(input.amount, meta.decimals);
  const balance = await ftBalanceOf(token, from).catch(() => null);
  if (balance === null) throw new DefiError("Your token balance could not be read. Please try again.", 502);
  if (BigInt(raw) > BigInt(balance)) throw new DefiError(`Insufficient ${meta.symbol} balance. You have ${fromBaseUnits(balance, meta.decimals, 6)} ${meta.symbol}.`);

  const transactions = [];
  const registered = await storageBalanceOf(token, to).catch(() => undefined);
  let storageNote: string | null = null;
  if (registered === undefined) throw new DefiError("Could not check whether the receiver can hold this token. Please try again.", 502);
  if (registered === null) {
    const bounds = await storageBalanceBounds(token);
    const deposit = bounds?.min && /^\d+$/.test(bounds.min) ? bounds.min : DEFAULT_FT_STORAGE_DEPOSIT;
    transactions.push(storageDeposit(token, to, deposit));
    storageNote = `${fmtNear(deposit)} one-time storage deposit so ${to} can hold ${meta.symbol}`;
  }
  transactions.push(ftTransfer(token, to, raw, input.memo ?? undefined));
  return {
    kind: "send",
    transactions,
    review: [
      { label: "Send", value: `${fromBaseUnits(raw, meta.decimals, 8)} ${meta.symbol}` },
      { label: "Token contract", value: token },
      { label: "To", value: to },
      { label: "From", value: from },
      ...(storageNote ? [{ label: "Also pays", value: storageNote }] : []),
      { label: "Network fee", value: "≈ 0.0005 NEAR + 1 yoctoNEAR security deposit" },
    ],
    warnings,
    safety: await safetyPromise,
  };
}

/* ------------------------------------------------------------------ */
/* Stake                                                               */
/* ------------------------------------------------------------------ */

export interface ValidatorRow {
  poolId: string;
  stakeNear: number;
  feePct: number | null;
  /** Estimated yearly reward for delegators after this validator's fee, in %. */
  aprPct: number | null;
}

let validatorCache: { at: number; list: ValidatorRow[]; networkAprPct: number | null } | null = null;

/**
 * Estimated staking reward before validator fees, in % a year, from live
 * protocol data: yearly inflation × share paid to validators × total
 * supply ÷ total stake of the current validators. An estimate: actual
 * rewards also depend on each validator's uptime and the network changing.
 */
export function networkApr(inputs: { inflation: number; treasuryShare: number; totalSupplyYocto: bigint }, totalStakedYocto: bigint): number | null {
  if (totalStakedYocto <= BigInt(0)) return null;
  const ratio = Number((inputs.totalSupplyYocto * BigInt(1_000_000)) / totalStakedYocto) / 1_000_000;
  const pct = inputs.inflation * (1 - inputs.treasuryShare) * ratio * 100;
  return Number.isFinite(pct) && pct > 0 && pct < 100 ? Math.round(pct * 100) / 100 : null;
}

export async function validators(): Promise<ValidatorRow[]> {
  return (await stakingOverview()).validators;
}

export async function stakingOverview(): Promise<{ validators: ValidatorRow[]; networkAprPct: number | null }> {
  if (validatorCache && Date.now() - validatorCache.at < 30 * 60_000) return { validators: validatorCache.list, networkAprPct: validatorCache.networkAprPct };
  const [current, inputs] = await Promise.all([currentValidators(), rewardInputs().catch(() => null)]);
  const totalStaked = current.reduce((t, v) => t + BigInt(v.stake), BigInt(0));
  const gross = inputs ? networkApr(inputs, totalStaked) : null;
  const top = current
    .filter((v) => !v.is_slashed && STAKING_POOL_RE.test(v.account_id))
    .sort((a, b) => (BigInt(b.stake) > BigInt(a.stake) ? 1 : -1))
    .slice(0, 40);
  const list = await Promise.all(
    top.map(async (v) => {
      const fee = await poolFee(v.account_id);
      const feePct = fee ? Math.round((fee.numerator / fee.denominator) * 10_000) / 100 : null;
      return {
        poolId: v.account_id,
        stakeNear: Number(fromBaseUnits(v.stake, NEAR_DECIMALS, 0)),
        feePct,
        aprPct: gross !== null && feePct !== null ? Math.round(gross * (1 - feePct / 100) * 100) / 100 : null,
      };
    }),
  );
  validatorCache = { at: Date.now(), list, networkAprPct: gross };
  return { validators: list, networkAprPct: gross };
}

export async function stakingPositions(accountId: string) {
  // FastNEAR's index can lag a fresh stake, so also look at the account's own
  // recent transactions to staking pools.
  const [indexed, recent] = await Promise.all([
    accountStakingPools(accountId).catch(() => [] as string[]),
    accountTransactions(accountId, 50).catch(() => []),
  ]);
  const fromHistory = recent
    .filter((t) => (t.signer_account_id ?? t.predecessor_account_id) === accountId && STAKING_POOL_RE.test(t.receiver_account_id))
    .map((t) => t.receiver_account_id);
  const pools = [...new Set([...indexed, ...fromHistory])];
  const rows = await Promise.all(
    pools.slice(0, 15).map(async (poolId) => {
      const a = await poolAccount(poolId, accountId);
      if (!a) return null;
      return {
        poolId,
        stakedYocto: a.staked_balance,
        staked: fromBaseUnits(a.staked_balance, NEAR_DECIMALS, 5),
        /** Exact amount, for "Max" (the short one is rounded down for display). */
        stakedExact: fromBaseUnits(a.staked_balance, NEAR_DECIMALS),
        unstakedYocto: a.unstaked_balance,
        unstaked: fromBaseUnits(a.unstaked_balance, NEAR_DECIMALS, 5),
        canWithdraw: a.can_withdraw,
      };
    }),
  );
  return rows.filter((r): r is NonNullable<typeof r> => r !== null && (r.stakedYocto !== "0" || r.unstakedYocto !== "0"));
}

/** Accounts created by the official staking-pool factories (mainnet + testnet). */
export const STAKING_POOL_RE = /\.(poolv1|pool)\.near$|\.pool\.f863973\.m0$/;

function requirePoolAccount(poolId: string) {
  if (!STAKING_POOL_RE.test(poolId)) throw new DefiError(`${poolId} is not a staking pool created by the official NEAR staking-pool factory.`);
}

async function requirePool(poolId: string) {
  requirePoolAccount(poolId);
  const fee = await poolFee(poolId);
  if (!fee) throw new DefiError(`${poolId} is not a valid staking pool.`);
  return fee;
}

export async function prepareStake(input: { from: string; pool: string; amount: string }): Promise<TransactionPlan> {
  const sender = await requireAccount(input.from);
  const fee = await requirePool(input.pool);
  const raw = parse(input.amount, NEAR_DECIMALS);
  if (BigInt(raw) < BigInt("1000000000000000000000000")) throw new DefiError("The minimum stake is 1 NEAR.");
  const spendable = spendableYocto(sender.amount, sender.storage_usage);
  if (BigInt(raw) > spendable) throw new DefiError(`Insufficient balance. You can stake up to ${fmtNear(spendable)}.`);
  return {
    kind: "stake",
    transactions: [depositAndStake(input.pool, raw)],
    review: [
      { label: "Stake", value: fmtNear(raw) },
      { label: "Validator", value: input.pool },
      { label: "Validator fee", value: `${Math.round((fee.numerator / fee.denominator) * 10_000) / 100}% of rewards` },
      { label: "Network fee", value: "≈ 0.001 NEAR (paid by your wallet)" },
    ],
    warnings: ["Staked NEAR earns rewards but is locked. Unstaking takes about 2–3 days (4 epochs) before you can withdraw."],
  };
}

export async function prepareUnstake(input: { from: string; pool: string; amount: string }): Promise<TransactionPlan> {
  requirePoolAccount(input.pool);
  await requireAccount(input.from);
  const a = await poolAccount(input.pool, input.from);
  if (!a) throw new DefiError(`No stake found with ${input.pool}.`);
  const raw = parse(input.amount, NEAR_DECIMALS);
  if (BigInt(raw) > BigInt(a.staked_balance)) throw new DefiError(`You have ${fmtNear(a.staked_balance)} staked with this validator.`);
  return {
    kind: "unstake",
    transactions: [unstake(input.pool, raw)],
    review: [
      { label: "Unstake", value: fmtNear(raw) },
      { label: "Validator", value: input.pool },
      { label: "Network fee", value: "≈ 0.001 NEAR (paid by your wallet)" },
    ],
    warnings: ["Unstaked NEAR stops earning rewards and becomes withdrawable after about 2–3 days (4 epochs)."],
  };
}

export async function prepareWithdraw(input: { from: string; pool: string }): Promise<TransactionPlan> {
  requirePoolAccount(input.pool);
  await requireAccount(input.from);
  const a = await poolAccount(input.pool, input.from);
  if (!a || a.unstaked_balance === "0") throw new DefiError("There is nothing to withdraw from this validator.");
  if (!a.can_withdraw) throw new DefiError("Your unstaked NEAR isn't withdrawable yet. Unstaking takes about 2–3 days.");
  return {
    kind: "withdraw",
    transactions: [withdrawAll(input.pool)],
    review: [
      { label: "Withdraw", value: fmtNear(a.unstaked_balance) },
      { label: "From validator", value: input.pool },
      { label: "Network fee", value: "≈ 0.001 NEAR (paid by your wallet)" },
    ],
    warnings: [],
  };
}

/* ------------------------------------------------------------------ */
/* Swap (NEAR Intents 1Click)                                          */
/* ------------------------------------------------------------------ */

export interface SwapToken {
  assetId: string;
  symbol: string;
  decimals: number;
  contractId: string; // "near" for native NEAR
  priceUsd: number;
}

/** NEAR-chain tokens routable through NEAR Intents (native NEAR via wrap.near). */
export async function swapTokens(): Promise<SwapToken[]> {
  const tokens = await intentsTokens();
  const out: SwapToken[] = [];
  const near = indexNearTokens(tokens).get("near");
  if (near) out.push({ assetId: near.assetId, symbol: "NEAR", decimals: NEAR_DECIMALS, contractId: "near", priceUsd: near.price });
  const seen = new Set<string>([near?.assetId ?? ""]);
  for (const t of tokens) {
    if (t.blockchain !== "near" || seen.has(t.assetId)) continue;
    const contract = t.contractAddress ?? (t.assetId.startsWith("nep141:") ? t.assetId.slice(7) : null);
    if (!contract || contract === "wrap.near") continue;
    seen.add(t.assetId);
    out.push({ assetId: t.assetId, symbol: t.symbol, decimals: t.decimals, contractId: contract, priceUsd: t.price });
  }
  return out.sort((a, b) => (a.contractId === "near" ? -1 : b.contractId === "near" ? 1 : a.symbol.localeCompare(b.symbol)));
}

export async function prepareSwap(input: {
  from: string;
  originAssetId: string;
  destinationAssetId: string;
  amount: string;
  slippageBps: number;
  dry: boolean;
}): Promise<{ quote: OneClickQuoteResponse; plan: TransactionPlan | null; origin: SwapToken; destination: SwapToken }> {
  if (input.originAssetId === input.destinationAssetId) throw new DefiError("Choose two different tokens.");
  const list = await swapTokens().catch(() => {
    throw new DefiError("The swap service could not be reached. Please try again shortly.", 502);
  });
  const origin = list.find((t) => t.assetId === input.originAssetId);
  const destination = list.find((t) => t.assetId === input.destinationAssetId);
  if (!origin || !destination) throw new DefiError("That token isn't supported for swaps.");
  const sender = await requireAccount(input.from);
  const raw = parse(input.amount, origin.decimals);

  // Balance check (native NEAR keeps a reserve for storage and fees).
  if (origin.contractId === "near") {
    const spendable = spendableYocto(sender.amount, sender.storage_usage);
    if (BigInt(raw) > spendable) throw new DefiError(`Insufficient balance. You can swap up to ${fmtNear(spendable)}.`);
  } else {
    const bal = await ftBalanceOf(origin.contractId, input.from).catch(() => null);
    if (bal === null) throw new DefiError("Your token balance could not be read. Please try again.", 502);
    if (BigInt(raw) > BigInt(bal)) throw new DefiError(`Insufficient ${origin.symbol} balance. You have ${fromBaseUnits(bal, origin.decimals, 6)} ${origin.symbol}.`);
  }

  const deadline = new Date(Date.now() + 20 * 60_000).toISOString();
  const quote = await requestQuote({
    dry: input.dry,
    swapType: "EXACT_INPUT",
    slippageTolerance: input.slippageBps,
    originAsset: origin.assetId,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: destination.assetId,
    amount: raw,
    refundTo: input.from,
    refundType: "ORIGIN_CHAIN",
    recipient: input.from,
    recipientType: "DESTINATION_CHAIN",
    deadline,
    referral: "veil-ai",
  });

  if (input.dry) return { quote, plan: null, origin, destination };

  const depositAddress = quote.quote.depositAddress;
  if (!depositAddress) throw new DefiError("The swap service did not return a deposit address. Nothing was sent; please try again.", 502);
  // Safety: the deposit must be exactly what the user reviewed.
  // Safety: funds must go back to the user's own account, and the quote must not ask for more than they approved.
  let amountInOk = false;
  try {
    amountInOk = BigInt(quote.quote.amountIn) === BigInt(raw);
  } catch {
    amountInOk = false;
  }
  const r = quote.quoteRequest;
  const matches =
    amountInOk &&
    r.recipient === input.from &&
    r.refundTo === input.from &&
    r.originAsset === origin.assetId &&
    r.destinationAsset === destination.assetId &&
    !(Number(r.slippageTolerance) > input.slippageBps) &&
    isValidAccountId(depositAddress);
  if (!matches) {
    throw new DefiError("The swap quote did not match your request, so it was discarded. Please try again.", 502);
  }

  const plan: TransactionPlan = {
    kind: "swap",
    transactions: swapDeposit({ originContract: origin.contractId, isNative: origin.contractId === "near", depositAddress, amountRaw: raw }),
    review: [
      { label: "You pay", value: `${quote.quote.amountInFormatted} ${origin.symbol}` },
      { label: "You receive (est.)", value: `${quote.quote.amountOutFormatted} ${destination.symbol}` },
      { label: "Minimum received", value: `${fromBaseUnits(quote.quote.minAmountOut, destination.decimals, 6)} ${destination.symbol}` },
      { label: "Slippage tolerance", value: `${input.slippageBps / 100}%` },
      { label: "Route", value: "NEAR Intents (1Click)" },
      { label: "Deposit address", value: depositAddress },
      { label: "Network fee", value: origin.contractId === "near" ? "≈ 0.0001 NEAR" : "≈ 0.0005 NEAR + 0.00125 NEAR storage deposit" },
    ],
    warnings: [
      "Your tokens go to a one-time NEAR Intents deposit address for this swap. If the swap can't complete by the deadline, they are refunded to your account.",
      `Quote valid until ${new Date(quote.quote.deadline ?? deadline).toLocaleTimeString("en-GB")}. Approve promptly.`,
    ],
  };
  return { quote, plan, origin, destination };
}

export type { IntentsToken };
