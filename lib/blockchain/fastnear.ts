import "server-only";
import { fetchJson } from "@/lib/blockchain/http";
import { getEnv, nearNetwork } from "@/lib/env";

/**
 * FastNEAR API — account → fungible tokens / staking pools.
 * Docs: https://github.com/fastnear/fastnear-api-server-rs
 */

export function fastnearBase() {
  return nearNetwork() === "testnet" ? "https://test.api.fastnear.com" : "https://api.fastnear.com";
}

function headers(): Record<string, string> {
  const key = getEnv().FASTNEAR_API_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

export interface FastnearFtToken {
  contract_id: string;
  balance: string | null;
  last_update_block_height: number | null;
}

export async function accountFungibleTokens(accountId: string): Promise<FastnearFtToken[]> {
  const r = await fetchJson<{ account_id: string; tokens: FastnearFtToken[] }>(
    "FastNEAR",
    `${fastnearBase()}/v1/account/${encodeURIComponent(accountId)}/ft`,
    { headers: headers(), revalidate: 30 },
  );
  return Array.isArray(r.tokens) ? r.tokens : [];
}

export async function accountStakingPools(accountId: string): Promise<string[]> {
  const r = await fetchJson<{ pools: { pool_id: string }[] }>(
    "FastNEAR",
    `${fastnearBase()}/v1/account/${encodeURIComponent(accountId)}/staking`,
    { headers: headers(), revalidate: 120 },
  );
  return Array.isArray(r.pools) ? r.pools.map((p) => p.pool_id).filter((p) => typeof p === "string") : [];
}
