/**
 * Builders for the NEAR transactions VEIL AI asks a user's wallet to sign.
 *
 * VEIL AI never signs anything itself: these functions only describe the
 * transaction. The user reviews it in VEIL AI, then approves (or rejects)
 * it inside their own wallet via NEAR Connect. Pure functions — unit tested.
 *
 * Action format: NEAR Connect / wallet-selector "ConnectorAction"
 * ({ type: "Transfer" | "FunctionCall", params }).
 */

import type { SafetyCheck } from "@/lib/defi/recipient-check";

export type ConnectorAction =
  | { type: "Transfer"; params: { deposit: string } }
  | { type: "FunctionCall"; params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string } };

export interface PlannedTransaction {
  receiverId: string;
  actions: ConnectorAction[];
}

export interface TransactionPlan {
  kind: "send" | "stake" | "unstake" | "withdraw" | "swap";
  transactions: PlannedTransaction[];
  /** Plain-language lines shown on the review screen, in order. */
  review: { label: string; value: string }[];
  warnings: string[];
  /** Pre-send safety check on the receiver (send only). */
  safety?: SafetyCheck;
}

export const TGAS = BigInt("1000000000000");
export const GAS = {
  ftTransfer: (BigInt(30) * TGAS).toString(),
  storageDeposit: (BigInt(30) * TGAS).toString(),
  staking: (BigInt(125) * TGAS).toString(),
} as const;
export const ONE_YOCTO = "1";
/** Standard NEP-145 registration deposit used by wallets for FT storage (0.00125 NEAR). */
export const DEFAULT_FT_STORAGE_DEPOSIT = "1250000000000000000000";

export function nativeTransfer(receiverId: string, amountYocto: string): PlannedTransaction {
  return { receiverId, actions: [{ type: "Transfer", params: { deposit: amountYocto } }] };
}

export function storageDeposit(tokenContract: string, accountId: string, depositYocto = DEFAULT_FT_STORAGE_DEPOSIT): PlannedTransaction {
  return {
    receiverId: tokenContract,
    actions: [
      {
        type: "FunctionCall",
        params: { methodName: "storage_deposit", args: { account_id: accountId, registration_only: true }, gas: GAS.storageDeposit, deposit: depositYocto },
      },
    ],
  };
}

export function ftTransfer(tokenContract: string, receiverId: string, amountRaw: string, memo?: string): PlannedTransaction {
  return {
    receiverId: tokenContract,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "ft_transfer",
          args: { receiver_id: receiverId, amount: amountRaw, ...(memo ? { memo } : {}) },
          gas: GAS.ftTransfer,
          deposit: ONE_YOCTO,
        },
      },
    ],
  };
}

/** Staking-pool calls (near/core-contracts staking-pool interface). */
export function depositAndStake(poolId: string, amountYocto: string): PlannedTransaction {
  return { receiverId: poolId, actions: [{ type: "FunctionCall", params: { methodName: "deposit_and_stake", args: {}, gas: GAS.staking, deposit: amountYocto } }] };
}

export function unstake(poolId: string, amountYocto: string): PlannedTransaction {
  return { receiverId: poolId, actions: [{ type: "FunctionCall", params: { methodName: "unstake", args: { amount: amountYocto }, gas: GAS.staking, deposit: "0" } }] };
}

export function withdrawAll(poolId: string): PlannedTransaction {
  return { receiverId: poolId, actions: [{ type: "FunctionCall", params: { methodName: "withdraw_all", args: {}, gas: GAS.staking, deposit: "0" } }] };
}

/**
 * Funding a NEAR Intents 1Click swap from a NEAR wallet (ORIGIN_CHAIN deposit):
 *  - native NEAR: plain transfer to the quote's deposit address;
 *  - NEP-141 token: register the deposit address with the token contract
 *    (storage_deposit, registration only), then ft_transfer to it.
 * Mirrors production integrations of the 1Click API.
 */
export function swapDeposit(params: { originContract: string; isNative: boolean; depositAddress: string; amountRaw: string }): PlannedTransaction[] {
  if (params.isNative) return [nativeTransfer(params.depositAddress, params.amountRaw)];
  return [storageDeposit(params.originContract, params.depositAddress), ftTransfer(params.originContract, params.depositAddress, params.amountRaw)];
}

/** Sum of NEAR attached across a plan (what leaves the wallet besides gas). */
export function attachedYocto(txs: PlannedTransaction[]): bigint {
  let total = BigInt(0);
  for (const t of txs) for (const a of t.actions) total += BigInt(a.params.deposit);
  return total;
}
