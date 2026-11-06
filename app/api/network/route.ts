import type { NextRequest } from "next/server";
import { fetchJson } from "@/lib/blockchain/http";
import { coingeckoSimplePrices, indexNearTokens, intentsTokens } from "@/lib/blockchain/prices";
import { rpcEndpoints } from "@/lib/near/rpc";
import { nearAiConfig, nearNetwork } from "@/lib/env";
import { clientIp, jsonOk, limitOrNull } from "@/lib/security/http";

/**
 * Live network status for the UI: latest final block, NEAR price and
 * whether the confidential AI service is connected. Public data only,
 * cached for 15 seconds so many viewers share one upstream request.
 */

export interface NetworkStatus {
  network: "mainnet" | "testnet";
  block: { height: number; timestamp: string } | null;
  near: { priceUsd: number | null; change24hPct: number | null };
  ai: { online: boolean };
  updatedAt: string;
}

let cache: { at: number; value: NetworkStatus } | null = null;
const TTL_MS = 15_000;

async function latestBlock(): Promise<NetworkStatus["block"]> {
  for (const endpoint of rpcEndpoints()) {
    try {
      const r = await fetchJson<{ result?: { header?: { height: number; timestamp_nanosec?: string; timestamp?: number } } }>("NEAR RPC", endpoint, {
        method: "POST",
        body: { jsonrpc: "2.0", id: "veil", method: "block", params: { finality: "final" } },
        timeoutMs: 6_000,
        retries: 0,
      });
      const h = r.result?.header;
      if (!h) continue;
      const ns = h.timestamp_nanosec ?? (h.timestamp !== undefined ? String(h.timestamp) : null);
      const ms = ns ? Number(BigInt(ns) / BigInt(1_000_000)) : Date.now();
      return { height: h.height, timestamp: new Date(ms).toISOString() };
    } catch {
      /* try next endpoint */
    }
  }
  return null;
}

async function nearPrice(): Promise<NetworkStatus["near"]> {
  const [intents, cg] = await Promise.allSettled([intentsTokens(), coingeckoSimplePrices(["near"])]);
  const fromIntents = intents.status === "fulfilled" ? (indexNearTokens(intents.value).get("near")?.price ?? null) : null;
  const cgNear = cg.status === "fulfilled" ? cg.value.near : undefined;
  return {
    priceUsd: fromIntents ?? cgNear?.usd ?? null,
    change24hPct: typeof cgNear?.usd_24h_change === "number" ? cgNear.usd_24h_change : null,
  };
}

export async function GET(req: NextRequest) {
  const limited = limitOrNull(`network:${clientIp(req)}`, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const [block, near] = await Promise.all([latestBlock(), nearPrice()]);
    cache = {
      at: Date.now(),
      value: { network: nearNetwork(), block, near, ai: { online: nearAiConfig().configured }, updatedAt: new Date().toISOString() },
    };
  }
  return jsonOk(cache.value, { cache: "public, max-age=10" });
}
