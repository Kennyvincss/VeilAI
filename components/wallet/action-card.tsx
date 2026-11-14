"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, ArrowUpRight, Layers, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { ChatAction } from "@/lib/ai/actions";
import { api, useApi } from "@/hooks/use-api";
import { useNearWallet } from "@/hooks/use-near-wallet";
import { useAppStatus } from "@/components/layout/app-status";
import { ReviewDialog, type ReviewPlan } from "@/components/wallet/review-dialog";
import type { WalletOverview } from "@/components/wallet/defi-panels";
import { Button } from "@/components/ui/primitives";
import { shortAccount } from "@/lib/utils/format";

interface Validator {
  poolId: string;
  stakeNear: number;
  feePct: number | null;
}
interface Position {
  poolId: string;
  staked: string;
  stakedYocto: string;
}
interface SwapToken {
  assetId: string;
  symbol: string;
  contractId: string;
}

const ICON = { send: ArrowUpRight, stake: Layers, unstake: Layers, swap: ArrowDownUp } as const;
const TITLE = { send: "Send", stake: "Stake", unstake: "Unstake", swap: "Swap" } as const;

/** Lowest-fee validator among the largest pools (ties → larger stake). */
export function lowestFeeValidator(list: Validator[]): Validator | null {
  const priced = list.filter((v) => v.feePct !== null);
  if (priced.length === 0) return null;
  return [...priced].sort((a, b) => (a.feePct as number) - (b.feePct as number) || b.stakeNear - a.stakeNear)[0];
}

/**
 * A wallet action detected in the user's own chat message. It is prepared
 * by the same server checks as the Wallet page, shown in the same review
 * dialog, and only sent if the user approves it in their wallet.
 */
export function ActionCard({ action }: { action: ChatAction }) {
  const { status } = useAppStatus();
  const wallet = useNearWallet(status.network);
  const [plan, setPlan] = useState<ReviewPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [chosenPool, setChosenPool] = useState<string | null>(null);
  const account = wallet.accountId;

  const overview = useApi<WalletOverview>(account && action.kind === "send" && action.token !== "NEAR" ? `/api/defi/overview?accountId=${encodeURIComponent(account)}` : null);
  const staking = useApi<{ validators: Validator[]; positions: Position[] }>(
    account && (action.kind === "stake" || action.kind === "unstake") ? `/api/defi/stake?accountId=${encodeURIComponent(account)}` : null,
  );
  const swap = useApi<{ tokens: SwapToken[]; available: boolean; reason?: string }>(account && action.kind === "swap" ? "/api/defi/swap/tokens" : null);

  /** Resolve symbols and pools into concrete parameters, or explain what's missing. */
  const resolved = useMemo((): { ready: boolean; problem?: string; detail?: string; pools?: { id: string; label: string }[]; pool?: string | null } => {
    if (!account) return { ready: false };
    switch (action.kind) {
      case "send": {
        if (action.token === "NEAR") return { ready: true };
        if (!overview.data) return { ready: false, problem: overview.error ?? undefined };
        // Symbols aren't unique (airdropped scam tokens copy them): only accept one unambiguous, priced match.
        const all = overview.data.tokens.filter((x) => x.symbol.toUpperCase() === action.token);
        const priced = all.filter((x) => x.priceUsd !== null);
        const t = all.length === 1 ? all[0] : priced.length === 1 ? priced[0] : null;
        if (all.length === 0) return { ready: false, problem: `This wallet doesn't hold ${action.token}.` };
        return t ? { ready: true, detail: t.contractId } : { ready: false, problem: `More than one token here is called ${action.token}. Use the Wallet page and pick the exact token contract.` };
      }
      case "stake": {
        if (!staking.data) return { ready: false, problem: staking.error ?? undefined };
        const pools = staking.data.validators.map((v) => ({ id: v.poolId, label: `${v.poolId} · ${v.feePct === null ? "fee n/a" : `${v.feePct}% fee`}` }));
        const preset = action.pool ?? lowestFeeValidator(staking.data.validators)?.poolId ?? null;
        if (action.pool && !pools.some((p) => p.id === action.pool)) pools.unshift({ id: action.pool, label: action.pool });
        return { ready: true, pools, pool: chosenPool ?? preset };
      }
      case "unstake": {
        if (!staking.data) return { ready: false, problem: staking.error ?? undefined };
        const staked = staking.data.positions.filter((p) => p.stakedYocto !== "0");
        if (staked.length === 0) return { ready: false, problem: "This wallet has no staked NEAR." };
        const pools = staked.map((p) => ({ id: p.poolId, label: `${p.poolId} · ${p.staked} NEAR staked` }));
        const preset = action.pool ?? (staked.length === 1 ? staked[0].poolId : null);
        return { ready: true, pools, pool: chosenPool ?? preset };
      }
      case "swap": {
        if (!swap.data) return { ready: false, problem: swap.error ?? undefined };
        if (!swap.data.available) return { ready: false, problem: swap.data.reason === "testnet" ? "Swaps run on NEAR mainnet only." : "Swaps are coming soon." };
        const find = (sym: string) => {
          if (sym === "NEAR") return swap.data!.tokens.filter((t) => t.contractId === "near");
          return swap.data!.tokens.filter((t) => t.symbol.toUpperCase() === sym);
        };
        const from = find(action.from);
        const to = find(action.to);
        if (from.length === 0 || to.length === 0) return { ready: false, problem: `${from.length === 0 ? action.from : action.to} isn't supported for swaps.` };
        if (from.length > 1 || to.length > 1) return { ready: false, problem: `More than one token matches ${from.length > 1 ? action.from : action.to}. Use the Swap tab to pick the exact one.` };
        return { ready: true, detail: `${from[0].assetId}|${to[0].assetId}` };
      }
    }
  }, [account, action, overview.data, overview.error, staking.data, staking.error, swap.data, swap.error, chosenPool]);

  async function prepare() {
    if (!account || !resolved.ready) return;
    setBusy(true);
    setError(null);
    try {
      let p: ReviewPlan;
      if (action.kind === "send") {
        p = await api<ReviewPlan>("/api/defi/send", { method: "POST", json: { from: account, to: action.to, token: action.token === "NEAR" ? "near" : resolved.detail, amount: action.amount } });
      } else if (action.kind === "stake" || action.kind === "unstake") {
        if (!resolved.pool) throw new Error("Choose a validator first.");
        p = await api<ReviewPlan>("/api/defi/stake", { method: "POST", json: { action: action.kind, from: account, pool: resolved.pool, amount: action.amount } });
      } else {
        const [originAssetId, destinationAssetId] = (resolved.detail ?? "|").split("|");
        const r = await api<{ plan: ReviewPlan | null }>("/api/defi/swap/quote", { method: "POST", json: { from: account, originAssetId, destinationAssetId, amount: action.amount, slippageBps: 100, dry: false } });
        if (!r.plan) throw new Error("The swap could not be prepared.");
        p = r.plan;
      }
      setPlan(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "This could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  const Icon = ICON[action.kind];
  const summary =
    action.kind === "send"
      ? `${action.amount} ${action.token} → ${shortAccount(action.to, 20, 6)}`
      : action.kind === "swap"
        ? `${action.amount} ${action.from} → ${action.to}`
        : `${action.amount} NEAR`;
  const loading = overview.loading || staking.loading || swap.loading;

  return (
    <div className="rounded-3xl border border-lavender/35 bg-lavender/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] text-accent-strong">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-accent-strong">Ready to prepare · {TITLE[action.kind]}</div>
          <div className="mt-0.5 break-all font-mono text-sm">{summary}</div>
          <p className="mt-1 text-xs text-muted">Nothing happens until you review it and approve it in your own wallet. This uses real funds.</p>
        </div>
      </div>

      {resolved.pools && (
        <label className="mt-3 block text-xs text-muted">
          {action.kind === "stake" ? "Validator" : "Unstake from"}
          {action.kind === "stake" && !action.pool && resolved.pool && <span className="text-subtle"> (lowest fee preselected)</span>}
          <select
            value={resolved.pool ?? ""}
            onChange={(e) => setChosenPool(e.target.value || null)}
            className="mt-1 w-full rounded-xl border border-border-strong bg-bg-2 px-3 py-2 font-mono text-xs text-text focus:border-accent/50 focus:outline-none"
          >
            {!resolved.pool && <option value="">Choose…</option>}
            {resolved.pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {(error || resolved.problem) && (
        <p role="alert" className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          {error ?? resolved.problem}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!account ? (
          <Button
            size="sm"
            loading={wallet.busy}
            onClick={async () => {
              try {
                await wallet.connect();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Wallet connection failed");
              }
            }}
          >
            {!wallet.busy && <Wallet className="h-3.5 w-3.5" />} Connect wallet to continue
          </Button>
        ) : sent ? (
          <span className="text-xs text-success">Sent. {action.kind === "swap" ? "Track progress on the " : "See balances on the "}<Link href="/dashboard/wallet" className="underline">Wallet page</Link>.</span>
        ) : (
          <Button size="sm" onClick={prepare} loading={busy || loading} disabled={!resolved.ready || ((action.kind === "stake" || action.kind === "unstake") && !resolved.pool)}>
            Review transaction
          </Button>
        )}
        {account && <span className="text-[0.7rem] text-subtle">From {shortAccount(account, 18, 6)}</span>}
      </div>

      <ReviewDialog
        plan={plan}
        network={status.network}
        onApprove={(p) => wallet.signAndSend(p.transactions)}
        onCancel={() => setPlan(null)}
        onDone={(hashes) => {
          // Swap deposit address: receiver of a native transfer, or the ft_transfer's receiver_id.
          const last = plan?.transactions[plan.transactions.length - 1];
          const first = last?.actions[0];
          const depositAddress = first?.type === "FunctionCall" ? (first.params.args.receiver_id as string | undefined) : last?.receiverId;
          if (plan?.kind === "swap" && depositAddress && hashes.length > 0) {
            void api("/api/defi/swap/submit", { method: "POST", json: { txHash: hashes[hashes.length - 1], depositAddress, from: account } }).catch(() => undefined);
          }
          setPlan(null);
          setSent(true);
        }}
      />
    </div>
  );
}
