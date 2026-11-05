import "server-only";
import type { PortfolioSnapshot, TokenHolding, WalletBalanceSummary } from "@/types";
import { SourceTracker } from "@/lib/blockchain/http";
import { accountFungibleTokens, accountStakingPools, fastnearBase } from "@/lib/blockchain/fastnear";
import { coingeckoSimplePrices, indexNearTokens, intentsTokens, isStablecoin, oneClickBase, type IntentsToken } from "@/lib/blockchain/prices";
import { ftMetadata, rpcEndpoints, stakedBalance, viewAccount } from "@/lib/near/rpc";
import { rawToNumber, yoctoToNear } from "@/lib/utils/units";
import { buildSnapshot, valueOf } from "@/lib/portfolio/compute";

const MAX_TOKENS_PER_WALLET = 30;
const MAX_POOLS_PER_WALLET = 8;

interface RawHolding {
  contractId: string;
  rawBalance: string;
  wallet: string;
  decimals?: number;
  symbol?: string;
  name?: string;
  icon?: string | null;
}

/**
 * Fetches LIVE balances for the given NEAR accounts from public providers
 * and values them with NEAR Intents + CoinGecko prices. Nothing here is
 * simulated: if a provider fails, the affected values are reported as
 * missing and the failure is listed in the provenance sources.
 */
export async function fetchLivePortfolio(
  accounts: { accountId: string; label?: string | null }[],
): Promise<PortfolioSnapshot> {
  const sources = new SourceTracker();
  const rpcUrl = rpcEndpoints()[0];
  const notes: string[] = [];

  // Prices first (shared across wallets).
  let intents = new Map<string, IntentsToken>();
  try {
    intents = indexNearTokens(
      await sources.track("NEAR Intents 1Click API", `${oneClickBase()}/v0/tokens`, "USD prices & Intents routability", intentsTokens),
    );
  } catch {
    notes.push("NEAR Intents price feed unavailable — falling back to CoinGecko where possible.");
  }

  const raw: RawHolding[] = [];
  const wallets: WalletBalanceSummary[] = [];

  await Promise.all(
    accounts.map(async ({ accountId, label }) => {
      const summary: WalletBalanceSummary = {
        accountId,
        label: label ?? null,
        nativeNear: 0,
        stakedNear: null,
        storageUsage: null,
        valueUsd: null,
        tokenCount: 0,
        ok: true,
      };
      try {
        const acct = await sources.track("NEAR RPC", rpcUrl, "Native NEAR balance (view_account)", () => viewAccount(accountId));
        if (!acct) {
          summary.ok = false;
          summary.error = "Account does not exist on this network";
          wallets.push(summary);
          return;
        }
        summary.nativeNear = yoctoToNear(acct.amount);
        summary.storageUsage = acct.storage_usage;
        raw.push({ contractId: "near", rawBalance: acct.amount, wallet: accountId, decimals: 24, symbol: "NEAR", name: "NEAR" });
      } catch (err) {
        summary.ok = false;
        summary.error = err instanceof Error ? err.message : "RPC error";
        wallets.push(summary);
        return;
      }

      const [ftResult, poolResult] = await Promise.allSettled([
        sources.track("FastNEAR API", fastnearBase(), "Fungible token balances", () => accountFungibleTokens(accountId)),
        sources.track("FastNEAR API", fastnearBase(), "Staking pool delegations", () => accountStakingPools(accountId)),
      ]);

      if (ftResult.status === "fulfilled") {
        const nonZero = ftResult.value.filter((t) => t.balance && /^\d+$/.test(t.balance) && t.balance !== "0");
        if (nonZero.length > MAX_TOKENS_PER_WALLET) {
          notes.push(`${accountId}: showing ${MAX_TOKENS_PER_WALLET} of ${nonZero.length} token balances.`);
        }
        // Prefer tokens we can price (Intents-listed) when truncating.
        nonZero.sort((a, b) => Number(intents.has(b.contract_id)) - Number(intents.has(a.contract_id)));
        const selected = nonZero.slice(0, MAX_TOKENS_PER_WALLET);
        await Promise.all(
          selected.map(async (t) => {
            const listed = intents.get(t.contract_id);
            const meta = await ftMetadata(t.contract_id);
            const decimals = meta?.decimals ?? listed?.decimals;
            if (decimals === undefined) return; // cannot interpret raw balance safely
            raw.push({
              contractId: t.contract_id,
              rawBalance: t.balance as string,
              wallet: accountId,
              decimals,
              symbol: meta?.symbol ?? listed?.symbol ?? t.contract_id,
              name: meta?.name ?? listed?.symbol ?? t.contract_id,
              icon: meta?.icon ?? null,
            });
          }),
        );
        summary.tokenCount = selected.length;
      } else {
        notes.push(`${accountId}: token balances unavailable (FastNEAR).`);
      }

      if (poolResult.status === "fulfilled" && poolResult.value.length > 0) {
        let stakedYocto = BigInt(0);
        let any = false;
        await Promise.all(
          poolResult.value.slice(0, MAX_POOLS_PER_WALLET).map(async (pool) => {
            const bal = await stakedBalance(pool, accountId);
            if (bal && /^\d+$/.test(bal)) {
              stakedYocto += BigInt(bal);
              any = true;
            }
          }),
        );
        if (any && stakedYocto > BigInt(0)) {
          summary.stakedNear = yoctoToNear(stakedYocto);
          raw.push({
            contractId: "near:staked",
            rawBalance: stakedYocto.toString(),
            wallet: accountId,
            decimals: 24,
            symbol: "NEAR",
            name: "NEAR (staked)",
          });
        } else {
          summary.stakedNear = 0;
        }
        sources.add("NEAR RPC", rpcUrl, "Staked balances (get_account_total_balance)", true);
      }
      wallets.push(summary);
    }),
  );

  // CoinGecko for 24h change (and price fallback).
  const cgIds = new Set<string>(["near"]);
  for (const h of raw) {
    const id = intents.get(baseContract(h.contractId))?.coingeckoId;
    if (id) cgIds.add(id);
  }
  let cg: Record<string, { usd?: number; usd_24h_change?: number }> = {};
  try {
    cg = await sources.track("CoinGecko API", "https://api.coingecko.com/api/v3", "24h price change", () =>
      coingeckoSimplePrices([...cgIds]),
    );
  } catch {
    notes.push("24h change unavailable (CoinGecko).");
  }

  const holdings: TokenHolding[] = raw.map((h) => {
    const listed = intents.get(baseContract(h.contractId));
    const cgId = h.contractId.startsWith("near") ? "near" : listed?.coingeckoId;
    const cgEntry = cgId ? cg[cgId] : undefined;
    const price = listed?.price ?? cgEntry?.usd ?? null;
    const amount = rawToNumber(h.rawBalance, h.decimals ?? 0);
    const symbol = h.symbol ?? "?";
    return {
      contractId: h.contractId,
      symbol,
      name: h.name ?? symbol,
      decimals: h.decimals ?? 0,
      rawBalance: h.rawBalance,
      amount,
      priceUsd: price,
      valueUsd: valueOf(amount, price),
      change24hPct: typeof cgEntry?.usd_24h_change === "number" ? cgEntry.usd_24h_change : null,
      intentsRoutable: h.contractId !== "near:staked" && Boolean(listed),
      isStablecoin: isStablecoin(symbol, price),
      coingeckoId: cgId,
      icon: h.icon ?? null,
      wallets: [h.wallet],
    };
  });

  for (const w of wallets) {
    const v = holdings.filter((h) => h.wallets.includes(w.accountId)).reduce((s, h) => s + (h.valueUsd ?? 0), 0);
    w.valueUsd = w.ok ? v : null;
  }

  notes.push("Tokens without a NEAR Intents listing or CoinGecko price are shown unpriced and excluded from totals (this also filters most spam airdrops).");

  return buildSnapshot(holdings, wallets.sort((a, b) => a.accountId.localeCompare(b.accountId)), {
    mode: "live",
    sources: sources.all(),
    generatedAt: new Date().toISOString(),
    notes,
  });
}

function baseContract(id: string) {
  return id === "near:staked" ? "near" : id;
}
