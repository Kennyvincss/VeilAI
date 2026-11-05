import "server-only";
import { fetchJson } from "@/lib/blockchain/http";
import { getEnv } from "@/lib/env";

/**
 * Market data.
 *
 * 1. NEAR Intents 1Click API — GET /v0/tokens (public, no JWT required).
 *    Returns every asset routable through NEAR Intents with a USD price,
 *    decimals, contract address and (when known) a CoinGecko id. We use it
 *    as the primary price source for NEAR tokens and as a liquidity signal
 *    ("can this asset be swapped via NEAR Intents?").
 *    Spec: @defuse-protocol/one-click-sdk-typescript (OneClickService.getTokens)
 *
 * 2. CoinGecko API v3 — 24h change and daily price history for volatility.
 *    https://docs.coingecko.com/reference/introduction
 */

export interface IntentsToken {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price: number;
  priceUpdatedAt: string;
  contractAddress?: string;
  coingeckoId?: string;
}

export function oneClickBase() {
  return (getEnv().ONECLICK_API_BASE ?? "https://1click.chaindefuser.com").replace(/\/+$/, "");
}

let tokensCache: { at: number; tokens: IntentsToken[] } | null = null;

export async function intentsTokens(): Promise<IntentsToken[]> {
  if (tokensCache && Date.now() - tokensCache.at < 60_000) return tokensCache.tokens;
  const tokens = await fetchJson<IntentsToken[]>("NEAR Intents 1Click", `${oneClickBase()}/v0/tokens`, {
    revalidate: 60,
    timeoutMs: 10_000,
  });
  const valid = Array.isArray(tokens) ? tokens.filter((t) => t && typeof t.symbol === "string") : [];
  tokensCache = { at: Date.now(), tokens: valid };
  return valid;
}

/** Map NEAR contract id → Intents token entry. Native NEAR resolves via wrap.near. */
export function indexNearTokens(tokens: IntentsToken[]): Map<string, IntentsToken> {
  const map = new Map<string, IntentsToken>();
  for (const t of tokens) {
    if (t.blockchain !== "near") continue;
    const contract = t.contractAddress ?? (t.assetId.startsWith("nep141:") ? t.assetId.slice(7) : undefined);
    if (contract && !map.has(contract)) map.set(contract, t);
  }
  const wrap = map.get("wrap.near");
  if (wrap && !map.has("near")) map.set("near", wrap);
  return map;
}

function coingecko() {
  const env = getEnv();
  const key = env.COINGECKO_API_KEY;
  const pro = env.COINGECKO_API_PLAN === "pro";
  return {
    base: pro ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3",
    headers: key ? { [pro ? "x-cg-pro-api-key" : "x-cg-demo-api-key"]: key } : ({} as Record<string, string>),
  };
}

export async function coingeckoSimplePrices(
  ids: string[],
): Promise<Record<string, { usd?: number; usd_24h_change?: number }>> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 50);
  if (unique.length === 0) return {};
  const cg = coingecko();
  return fetchJson("CoinGecko", `${cg.base}/simple/price?ids=${unique.map(encodeURIComponent).join(",")}&vs_currencies=usd&include_24hr_change=true`, {
    headers: cg.headers,
    revalidate: 120,
  });
}

/** Daily closing prices for the last `days` days. */
export async function coingeckoDailyPrices(id: string, days = 30): Promise<number[]> {
  const cg = coingecko();
  const r = await fetchJson<{ prices: [number, number][] }>(
    "CoinGecko",
    `${cg.base}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}&interval=daily`,
    { headers: cg.headers, revalidate: 3600 },
  );
  return Array.isArray(r.prices) ? r.prices.map((p) => p[1]).filter((v) => Number.isFinite(v)) : [];
}

const STABLE_SYMBOLS = new Set(["USDT", "USDT.E", "USDC", "USDC.E", "DAI", "USDT.e", "FRAX", "USN", "USDD", "PYUSD", "USDE", "USDS"]);

export function isStablecoin(symbol: string, price: number | null): boolean {
  const s = symbol.toUpperCase();
  if (!STABLE_SYMBOLS.has(s) && !/^USD[CT]/.test(s)) return false;
  return price === null || (price > 0.95 && price < 1.05);
}
