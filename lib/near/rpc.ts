import "server-only";
import { fetchJson, ProviderError } from "@/lib/blockchain/http";
import { getEnv, nearNetwork } from "@/lib/env";

/**
 * Minimal NEAR JSON-RPC client (https://docs.near.org/api/rpc/introduction).
 * Only read-only `query` requests are used; VEIL AI never signs or sends
 * transactions.
 */

const DEFAULT_RPC: Record<"mainnet" | "testnet", string[]> = {
  mainnet: ["https://free.rpc.fastnear.com", "https://rpc.mainnet.near.org"],
  testnet: ["https://test.rpc.fastnear.com", "https://rpc.testnet.near.org"],
};

export function rpcEndpoints(): string[] {
  const custom = getEnv().NEAR_RPC_URLS;
  if (custom) return custom.split(",").map((s) => s.trim()).filter(Boolean);
  return DEFAULT_RPC[nearNetwork()];
}

interface RpcResponse<T> {
  result?: T;
  error?: { name?: string; cause?: { name?: string; info?: unknown }; message?: string; data?: string };
}

export class RpcQueryError extends Error {
  constructor(
    public causeName: string,
    message: string,
  ) {
    super(message);
  }
}

async function rpcQuery<T>(params: Record<string, unknown>): Promise<T> {
  let lastErr: unknown;
  for (const endpoint of rpcEndpoints()) {
    try {
      const res = await fetchJson<RpcResponse<T> & { result?: T & { error?: string } }>("NEAR RPC", endpoint, {
        method: "POST",
        body: { jsonrpc: "2.0", id: "veil", method: "query", params: { finality: "final", ...params } },
        timeoutMs: 8_000,
        retries: 0,
      });
      if (res.error) {
        const cause = res.error.cause?.name ?? res.error.name ?? "UNKNOWN";
        // Deterministic errors (unknown account etc.) should not fall through to other RPCs.
        throw new RpcQueryError(cause, res.error.data ?? res.error.message ?? cause);
      }
      // Older nodes report some errors inside `result.error`.
      if (res.result && typeof res.result === "object" && "error" in res.result && res.result.error) {
        throw new RpcQueryError("QUERY_ERROR", String(res.result.error));
      }
      return res.result as T;
    } catch (err) {
      if (err instanceof RpcQueryError) throw err;
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new ProviderError("NEAR RPC", "all endpoints failed");
}

export interface ViewAccountResult {
  amount: string;
  locked: string;
  code_hash: string;
  storage_usage: number;
  block_height: number;
}

const EMPTY_CODE_HASH = "11111111111111111111111111111111";

export async function viewAccount(accountId: string): Promise<(ViewAccountResult & { isContract: boolean }) | null> {
  try {
    const r = await rpcQuery<ViewAccountResult>({ request_type: "view_account", account_id: accountId });
    return { ...r, isContract: r.code_hash !== EMPTY_CODE_HASH };
  } catch (err) {
    if (err instanceof RpcQueryError && /UNKNOWN_ACCOUNT|does not exist/i.test(`${err.causeName} ${err.message}`)) {
      return null;
    }
    throw err;
  }
}

/** Call a view method; returns parsed JSON. */
export async function callView<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await rpcQuery<{ result: number[] }>({
    request_type: "call_function",
    account_id: contractId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(r.result).toString("utf8")) as T;
}

export interface AccessKeyView {
  nonce: number;
  permission: "FullAccess" | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } };
}

/** Returns the access key, or null if the key is not registered on the account. */
export async function viewAccessKey(accountId: string, publicKey: string): Promise<AccessKeyView | null> {
  try {
    return await rpcQuery<AccessKeyView>({ request_type: "view_access_key", account_id: accountId, public_key: publicKey });
  } catch (err) {
    if (err instanceof RpcQueryError) return null;
    throw err;
  }
}

export interface FtMetadata {
  spec: string;
  name: string;
  symbol: string;
  icon: string | null;
  decimals: number;
}

const metadataCache = new Map<string, { at: number; value: FtMetadata | null }>();

export async function ftMetadata(contractId: string): Promise<FtMetadata | null> {
  const hit = metadataCache.get(contractId);
  if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.value;
  try {
    const m = await callView<FtMetadata>(contractId, "ft_metadata");
    const value =
      m && typeof m.decimals === "number" && typeof m.symbol === "string"
        ? { ...m, icon: typeof m.icon === "string" && m.icon.length < 20_000 ? m.icon : null }
        : null;
    metadataCache.set(contractId, { at: Date.now(), value });
    return value;
  } catch {
    metadataCache.set(contractId, { at: Date.now(), value: null });
    return null;
  }
}

/** Staked balance in a staking pool (standard core-contracts staking pool interface). */
export async function stakedBalance(poolId: string, accountId: string): Promise<string | null> {
  try {
    return await callView<string>(poolId, "get_account_total_balance", { account_id: accountId });
  } catch {
    return null;
  }
}
