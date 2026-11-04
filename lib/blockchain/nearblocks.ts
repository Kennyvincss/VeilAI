import "server-only";
import { fetchJson } from "@/lib/blockchain/http";
import { getEnv, nearNetwork } from "@/lib/env";
import type { NormalizedFtTransfer, NormalizedTx, TxDirection } from "@/types";
import { nanosToIso, rawToNumber, yoctoToNear } from "@/lib/utils/units";

/**
 * NearBlocks API (https://api.nearblocks.io/api-docs). Anonymous access is
 * allowed with a low rate limit; set NEARBLOCKS_API_KEY for higher limits.
 * Response shapes follow apps/api/src/services/account/{txn,ft}.ts in
 * github.com/Nearblocks/nearblocks.
 */

export function nearblocksBase() {
  return nearNetwork() === "testnet" ? "https://api-testnet.nearblocks.io" : "https://api.nearblocks.io";
}

function headers(): Record<string, string> {
  const key = getEnv().NEARBLOCKS_API_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

export interface NbAction {
  action: string;
  method: string | null;
  deposit: number | string | null;
  fee?: number | string | null;
  args?: string | null;
}

export interface NbTxn {
  id?: string;
  signer_account_id?: string;
  predecessor_account_id?: string;
  receiver_account_id: string;
  transaction_hash: string;
  block_timestamp: string;
  block?: { block_height: number };
  actions?: NbAction[] | null;
  actions_agg?: { deposit: number | string } | null;
  outcomes?: { status: boolean | null } | null;
  outcomes_agg?: { transaction_fee: number | string } | null;
}

export interface NbFtTxn {
  event_index: string;
  affected_account_id: string;
  involved_account_id: string | null;
  delta_amount: string;
  cause: string;
  transaction_hash: string;
  block_timestamp: string;
  ft?: { contract: string; name: string; symbol: string; decimals: number; icon?: string | null } | null;
}

export async function accountTransactions(accountId: string, perPage = 50): Promise<NbTxn[]> {
  const r = await fetchJson<{ txns: NbTxn[] }>(
    "NearBlocks",
    `${nearblocksBase()}/v1/account/${encodeURIComponent(accountId)}/txns-only?per_page=${perPage}&order=desc`,
    { headers: headers(), revalidate: 60, timeoutMs: 15_000 },
  );
  return Array.isArray(r.txns) ? r.txns : [];
}

export async function accountFtTransfers(accountId: string, perPage = 50): Promise<NbFtTxn[]> {
  const r = await fetchJson<{ txns: NbFtTxn[] }>(
    "NearBlocks",
    `${nearblocksBase()}/v1/account/${encodeURIComponent(accountId)}/ft-txns?per_page=${perPage}&order=desc`,
    { headers: headers(), revalidate: 60, timeoutMs: 15_000 },
  );
  return Array.isArray(r.txns) ? r.txns : [];
}

export async function accountTransactionCount(accountId: string): Promise<number | null> {
  try {
    const r = await fetchJson<{ txns: { count: string | number }[] }>(
      "NearBlocks",
      `${nearblocksBase()}/v1/account/${encodeURIComponent(accountId)}/txns-only/count`,
      { headers: headers(), revalidate: 300 },
    );
    const c = Number(r.txns?.[0]?.count);
    return Number.isFinite(c) ? c : null;
  } catch {
    return null;
  }
}

/* ---------------- normalisation (pure) ---------------- */

function toYoctoString(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "0";
  if (typeof v === "number") {
    // NearBlocks serialises NUMERIC as JSON numbers in some routes; avoid exponent notation.
    return BigInt(Math.trunc(v)).toString();
  }
  return v.split(".")[0] || "0";
}

export function normalizeTxn(subject: string, t: NbTxn): NormalizedTx {
  const signer = t.signer_account_id ?? t.predecessor_account_id ?? "unknown";
  const receiver = t.receiver_account_id;
  const direction: TxDirection =
    signer === subject && receiver === subject ? "self" : signer === subject ? "out" : receiver === subject ? "in" : "other";
  const actions = (t.actions ?? []).map((a) => ({
    kind: String(a.action ?? "UNKNOWN"),
    method: a.method ?? null,
    depositNear: yoctoToNear(toYoctoString(a.deposit)),
  }));
  const depositNear = t.actions_agg?.deposit !== undefined && t.actions_agg !== null
    ? yoctoToNear(toYoctoString(t.actions_agg.deposit))
    : actions.reduce((s, a) => s + a.depositNear, 0);
  return {
    hash: t.transaction_hash,
    timestamp: nanosToIso(t.block_timestamp),
    signer,
    receiver,
    direction,
    actions,
    depositNear,
    feeNear: yoctoToNear(toYoctoString(t.outcomes_agg?.transaction_fee)),
    success: t.outcomes?.status ?? null,
    blockHeight: t.block?.block_height,
  };
}

export function normalizeFtTxn(t: NbFtTxn): NormalizedFtTransfer {
  const decimals = typeof t.ft?.decimals === "number" ? t.ft.decimals : 0;
  return {
    hash: t.transaction_hash,
    timestamp: nanosToIso(t.block_timestamp),
    contractId: t.ft?.contract ?? "unknown",
    symbol: t.ft?.symbol ?? "?",
    decimals,
    delta: rawToNumber(t.delta_amount, decimals),
    counterparty: t.involved_account_id ?? null,
    cause: t.cause ?? "TRANSFER",
  };
}
