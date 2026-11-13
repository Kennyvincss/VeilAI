"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { ArrowDownUp, CheckCircle2, Copy, Info, Layers, Loader2, RefreshCw, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, useApi } from "@/hooks/use-api";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, Skeleton } from "@/components/ui/primitives";
import type { ReviewPlan } from "@/components/wallet/review-dialog";
import type { Contact } from "@/hooks/use-contacts";
import { notify } from "@/components/notifications/notification-center";
import { fromBaseUnits } from "@/lib/defi/amounts";
import { isValidAccountId, looksLikeSecret, normalizeAccountId } from "@/lib/near/account";
import { cn, formatUsd, shortAccount } from "@/lib/utils/format";

export interface WalletOverview {
  accountId: string;
  near: { totalYocto: string; spendableYocto: string; spendable: string; lockedForStorage: string; priceUsd: number | null };
  tokens: { contractId: string; symbol: string; name: string; decimals: number; rawBalance: string; amount: number; priceUsd: number | null; valueUsd: number | null; icon: string | null }[];
  totalValueUsd: number | null;
  staking?: { staked: string; unstaked: string; withdrawable: boolean; pools: number } | null;
}

type OnPlan = (plan: ReviewPlan, meta?: { depositAddress?: string }) => void;

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
      {error}
    </p>
  );
}

function AmountInput({ id, value, onChange, onMax, suffix }: { id: string; value: string; onChange: (v: string) => void; onMax?: () => void; suffix: string }) {
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.0"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        className="pr-28 font-mono text-base"
      />
      <div className="absolute inset-y-0 right-2 flex items-center gap-1.5">
        {onMax && (
          <button type="button" onClick={onMax} className="rounded-md bg-accent/15 px-2 py-0.5 text-[0.7rem] font-semibold text-accent-strong hover:bg-accent/25">
            MAX
          </button>
        )}
        <span className="text-xs text-muted">{suffix}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Send                                                                */
/* ------------------------------------------------------------------ */

export function SendPanel({
  accountId,
  overview,
  onPlan,
  contacts = [],
  onSaveContact,
  initialTo,
}: {
  accountId: string;
  overview: WalletOverview | null;
  onPlan: OnPlan;
  contacts?: Contact[];
  onSaveContact?: (label: string, accountId: string) => Promise<void>;
  initialTo?: string;
}) {
  const [token, setToken] = useState("near");
  const [to, setTo] = useState(initialTo ?? "");
  const [saveName, setSaveName] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const { busy, error, setError, run } = useSubmit();

  const options = [{ contractId: "near", symbol: "NEAR", max: overview?.near.spendable ?? "0" }, ...(overview?.tokens ?? []).map((t) => ({ contractId: t.contractId, symbol: t.symbol, max: fromBaseUnits(t.rawBalance, t.decimals) }))];
  const current = options.find((o) => o.contractId === token) ?? options[0];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (looksLikeSecret(to) || looksLikeSecret(memo)) {
      setTo("");
      setMemo("");
      return setError("That looks like a private key or recovery phrase. It was cleared and never sent. Never share it.");
    }
    const receiver = normalizeAccountId(to);
    if (!isValidAccountId(receiver)) return setError("Enter a valid NEAR account, e.g. alice.near");
    const plan = await run(() => api<ReviewPlan>("/api/defi/send", { method: "POST", json: { from: accountId, to: receiver, token, amount, memo: memo || null, contacts: contacts.map((c) => c.accountId).slice(0, 100) } }));
    if (plan) onPlan(plan);
  }

  return (
    <Card>
      <CardHeader icon={<Send className="h-4 w-4" />} title="Send" subtitle="Transfer NEAR or a NEAR token to another account" />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="send-token">Asset</Label>
          <select id="send-token" value={token} onChange={(e) => setToken(e.target.value)} className="h-11 w-full rounded-xl border border-border-strong bg-bg-2 px-3 text-sm text-text focus:border-accent/60 focus:outline-none">
            {options.map((o) => (
              <option key={o.contractId} value={o.contractId}>
                {o.symbol} — {o.max} available
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="send-to">Recipient</Label>
          <Input id="send-to" placeholder="alice.near" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} autoComplete="off" className="font-mono text-sm" />
          {contacts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Saved contacts">
              {contacts.slice(0, 12).map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setTo(c.accountId)}
                  title={c.accountId}
                  className={cn("rounded-full border px-2.5 py-1 text-[0.7rem] transition-colors", normalizeAccountId(to) === c.accountId ? "border-text bg-white text-text" : "border-border bg-bg-2 text-muted hover:text-text")}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {onSaveContact && isValidAccountId(normalizeAccountId(to)) && !contacts.some((c) => c.accountId === normalizeAccountId(to)) && (
            saveName === null ? (
              <button type="button" onClick={() => setSaveName("")} className="mt-2 text-[0.72rem] text-accent-strong hover:underline">
                + Save to address book
              </button>
            ) : (
              <div className="mt-2 flex gap-2">
                <Input aria-label="Contact name" placeholder="Name, e.g. Alice" value={saveName} maxLength={40} onChange={(e) => setSaveName(e.target.value)} className="h-9 text-xs" />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!saveName.trim()}
                  onClick={async () => {
                    try {
                      await onSaveContact(saveName.trim(), normalizeAccountId(to));
                      setSaveName(null);
                      toast.success("Saved to address book");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not save contact");
                    }
                  }}
                >
                  Save
                </Button>
              </div>
            )
          )}
        </div>
        <div>
          <Label htmlFor="send-amount" hint={`Available: ${current.max} ${current.symbol}`}>
            Amount
          </Label>
          <AmountInput id="send-amount" value={amount} onChange={setAmount} onMax={() => setAmount(current.max)} suffix={current.symbol} />
          {token === "near" && <p className="mt-1 text-[0.68rem] text-subtle">A small amount is kept back to cover storage and network fees.</p>}
        </div>
        <div>
          <Label htmlFor="send-memo" hint="Optional · tokens only">
            Memo
          </Label>
          <Input id="send-memo" value={memo} maxLength={120} disabled={token === "near"} onChange={(e) => setMemo(e.target.value)} className="text-sm" />
        </div>
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={busy} disabled={!to || !amount}>
          Review transfer
        </Button>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Receive                                                             */
/* ------------------------------------------------------------------ */

export function ReceivePanel({ accountId, network }: { accountId: string; network: "mainnet" | "testnet" }) {
  const [svg, setSvg] = useState<string>("");
  useEffect(() => {
    QRCode.toString(accountId, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#08090D", light: "#FFFFFF" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [accountId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(accountId);
      toast.success("Address copied");
    } catch {
      toast.error("Copy failed — select the address and copy it manually");
    }
  }

  return (
    <Card>
      <CardHeader icon={<ArrowDownUp className="h-4 w-4" />} title="Receive" subtitle={`Share your NEAR ${network} address`} />
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <div className="h-48 w-48 shrink-0 overflow-hidden rounded-2xl bg-white p-2" aria-label={`QR code for ${accountId}`} role="img">
          {svg ? <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <Skeleton className="h-full w-full" />}
        </div>
        <div className="w-full min-w-0 space-y-3">
          <div>
            <div className="text-xs text-muted">Your address</div>
            <div className="mt-1 break-all rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-sm">{accountId}</div>
          </div>
          <Button variant="secondary" onClick={copy} className="w-full sm:w-auto">
            <Copy className="h-4 w-4" /> Copy address
          </Button>
          <ul className="space-y-1.5 text-xs leading-relaxed text-muted">
            <li className="flex gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" /> Accepts NEAR and NEAR tokens (NEP-141) sent on the NEAR network.
            </li>
            <li className="flex gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" /> Sending from an exchange? Choose the <strong className="text-text">NEAR</strong> network when withdrawing.
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Swap                                                                */
/* ------------------------------------------------------------------ */

interface SwapToken {
  assetId: string;
  symbol: string;
  decimals: number;
  contractId: string;
  priceUsd: number;
}
interface QuoteView {
  quote: { amountInFormatted: string; amountOutFormatted: string; amountOutUsd: string; amountInUsd: string; minAmountOut: string; timeEstimate: number; depositAddress: string | null };
  origin: SwapToken;
  destination: SwapToken;
  plan: ReviewPlan | null;
}

export function SwapPanel({ accountId, overview, onPlan }: { accountId: string; overview: WalletOverview | null; onPlan: OnPlan }) {
  const tokens = useApi<{ tokens: SwapToken[]; available: boolean; reason?: "ok" | "testnet" | "not-configured" }>("/api/defi/swap/tokens");
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(100);
  const [quoted, setQuoted] = useState<{ key: string; view: QuoteView | null; error: string | null } | null>(null);
  const { busy, error, run } = useSubmit();
  const seq = useRef(0);

  const list = useMemo(() => tokens.data?.tokens ?? [], [tokens.data]);
  const held = (t: SwapToken | undefined) => {
    if (!t || !overview) return "0";
    if (t.contractId === "near") return overview.near.spendable;
    const h = overview.tokens.find((x) => x.contractId === t.contractId);
    return h ? fromBaseUnits(h.rawBalance, h.decimals) : "0";
  };

  useEffect(() => {
    if (!list.length) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- choose sensible default pair once tokens load
    if (!fromId) setFromId(list.find((t) => t.contractId === "near")?.assetId ?? list[0].assetId);
    if (!toId) setToId(list.find((t) => /^USDC$/i.test(t.symbol))?.assetId ?? list[1]?.assetId ?? "");
  }, [list, fromId, toId]);

  // Debounced preview quote (dry run — nothing is reserved or sent). Each
  // result is tagged with the inputs it was made for, so a stale quote is never shown.
  const quoteKey = `${fromId}|${toId}|${amount}|${slippage}`;
  const canQuote = Boolean(fromId && toId && amount && Number(amount) > 0 && fromId !== toId);
  useEffect(() => {
    if (!canQuote) return;
    const id = ++seq.current;
    const key = quoteKey;
    const t = setTimeout(async () => {
      try {
        const q = await api<QuoteView>("/api/defi/swap/quote", { method: "POST", json: { from: accountId, originAssetId: fromId, destinationAssetId: toId, amount, slippageBps: slippage, dry: true } });
        if (id === seq.current) setQuoted({ key, view: q, error: null });
      } catch (err) {
        if (id === seq.current) setQuoted({ key, view: null, error: err instanceof Error ? err.message : "Could not get a quote" });
      }
    }, 600);
    return () => clearTimeout(t);
  }, [canQuote, quoteKey, fromId, toId, amount, slippage, accountId]);

  const current = quoted?.key === quoteKey ? quoted : null;
  const preview = canQuote ? (current?.view ?? null) : null;
  const quoting = canQuote && !current;
  const quoteError = canQuote ? (current?.error ?? null) : null;
  const from = list.find((t) => t.assetId === fromId);

  async function review(e: FormEvent) {
    e.preventDefault();
    const q = await run(() => api<QuoteView>("/api/defi/swap/quote", { method: "POST", json: { from: accountId, originAssetId: fromId, destinationAssetId: toId, amount, slippageBps: slippage, dry: false } }));
    if (q?.plan) onPlan(q.plan, { depositAddress: q.quote.depositAddress ?? undefined });
  }

  if (tokens.loading) return <Card><Skeleton className="h-64" /></Card>;
  if (!list.length || tokens.data?.available === false) {
    return (
      <Card>
        <CardHeader icon={<ArrowDownUp className="h-4 w-4" />} title="Swap" subtitle="Powered by NEAR Intents" />
        {tokens.data?.reason === "testnet" ? (
          <EmptyState icon={<ArrowDownUp className="h-5 w-5" />} title="Swaps run on NEAR mainnet only" description="NEAR Intents doesn't operate on testnet. Send, receive and staking work here with free test NEAR." />
        ) : (
          <EmptyState icon={<ArrowDownUp className="h-5 w-5" />} title="Swaps are temporarily unavailable" description="Send, receive and staking still work. Please check back soon." />
        )}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader icon={<ArrowDownUp className="h-4 w-4" />} title="Swap" subtitle="Best-price routing via NEAR Intents" action={<Badge tone="accent">NEAR Intents</Badge>} />
      <form onSubmit={review} className="space-y-4" noValidate>
        <div className="rounded-2xl border border-border bg-bg-2/60 p-3">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>You pay</span>
            <span>Balance: {held(from)} {from?.symbol}</span>
          </div>
          <div className="mt-2 flex gap-2">
            <TokenSelect id="swap-from" list={list} value={fromId} onChange={setFromId} />
            <AmountInput id="swap-amount" value={amount} onChange={setAmount} onMax={() => setAmount(held(from))} suffix="" />
          </div>
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              setFromId(toId);
              setToId(fromId);
            }}
            className="-my-2 rounded-xl border border-border bg-card p-2 text-muted hover:text-text"
            aria-label="Switch tokens"
          >
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>
        <div className="rounded-2xl border border-border bg-bg-2/60 p-3">
          <div className="text-xs text-muted">You receive (estimated)</div>
          <div className="mt-2 flex items-center gap-2">
            <TokenSelect id="swap-to" list={list} value={toId} onChange={setToId} />
            <div className="min-w-0 flex-1 truncate text-right font-mono text-lg">
              {quoting ? <Loader2 className="ml-auto h-5 w-5 animate-spin text-subtle" /> : preview ? preview.quote.amountOutFormatted : "—"}
            </div>
          </div>
          {preview && <div className="mt-1 text-right text-[0.7rem] text-subtle">≈ {formatUsd(Number(preview.quote.amountOutUsd))}</div>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-muted">Slippage tolerance</span>
          <div className="flex gap-1" role="radiogroup" aria-label="Slippage tolerance">
            {[50, 100, 200].map((bp) => (
              <button
                key={bp}
                type="button"
                role="radio"
                aria-checked={slippage === bp}
                onClick={() => setSlippage(bp)}
                className={cn("rounded-lg border px-2.5 py-1", slippage === bp ? "border-text bg-white text-text" : "border-border text-muted hover:text-text")}
              >
                {bp / 100}%
              </button>
            ))}
          </div>
        </div>
        {preview && (
          <div className="flex justify-between text-xs text-muted">
            <span>Estimated time</span>
            <span>~{Math.max(1, Math.round(preview.quote.timeEstimate))}s</span>
          </div>
        )}
        <ErrorLine error={error ?? quoteError} />
        <Button type="submit" className="w-full" loading={busy} disabled={!preview || quoting}>
          Review swap
        </Button>
        <p className="text-center text-[0.68rem] text-subtle">Quotes come from NEAR Intents solvers. Nothing is sent until you approve in your wallet.</p>
      </form>
    </Card>
  );
}

function TokenSelect({ id, list, value, onChange }: { id: string; list: SwapToken[]; value: string; onChange: (v: string) => void }) {
  return (
    <select id={id} aria-label="Token" value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-32 shrink-0 rounded-xl border border-border-strong bg-card px-2.5 text-sm font-medium text-text focus:border-accent/60 focus:outline-none">
      {list.map((t) => (
        <option key={t.assetId} value={t.assetId}>
          {t.symbol}
        </option>
      ))}
    </select>
  );
}

/** Polls 1Click for swap progress after the deposit is sent. */
export function SwapTracker({ depositAddress, onClose }: { depositAddress: string; onClose: () => void }) {
  const [status, setStatus] = useState<string>("PENDING_DEPOSIT");
  const done = ["SUCCESS", "REFUNDED", "FAILED"].includes(status);
  useEffect(() => {
    if (done) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await api<{ status: string }>(`/api/defi/swap/status?depositAddress=${encodeURIComponent(depositAddress)}`);
        if (stop) return;
        setStatus(s.status);
        const final: Record<string, string> = { SUCCESS: "Swap completed", REFUNDED: "Swap refunded", FAILED: "Swap failed" };
        if (final[s.status]) {
          notify({
            id: `swap:${depositAddress}:${s.status}`,
            kind: "swap",
            title: final[s.status],
            body: s.status === "SUCCESS" ? "Your tokens have arrived in your wallet." : s.status === "REFUNDED" ? "The swap couldn't complete; your tokens were refunded." : "If funds were taken, they'll be refunded to your account.",
            href: "/dashboard/wallet?tab=activity",
          });
        }
      } catch {
        /* keep polling */
      }
    };
    void tick();
    const t = setInterval(tick, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [depositAddress, done]);

  const label: Record<string, string> = {
    PENDING_DEPOSIT: "Waiting for your deposit to arrive…",
    KNOWN_DEPOSIT_TX: "Deposit detected…",
    INCOMPLETE_DEPOSIT: "Deposit is lower than quoted — it will be refunded after the deadline.",
    PROCESSING: "Swapping…",
    SUCCESS: "Swap complete. The tokens are in your wallet.",
    REFUNDED: "The swap couldn't complete and your tokens were refunded.",
    FAILED: "The swap failed. If funds were taken, they will be refunded to your account.",
  };
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border p-4 text-sm", status === "SUCCESS" ? "border-success/30 bg-success/[0.06]" : status === "FAILED" ? "border-danger/30 bg-danger/[0.06]" : "border-lavender bg-lavender/20")}>
      {status === "SUCCESS" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : status === "FAILED" || status === "REFUNDED" ? <XCircle className="h-5 w-5 shrink-0 text-warning" /> : <Loader2 className="h-5 w-5 shrink-0 animate-spin text-accent-strong" />}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{label[status] ?? status}</div>
        <div className="mt-0.5 truncate font-mono text-[0.68rem] text-subtle">Deposit address {shortAccount(depositAddress, 10, 8)}</div>
      </div>
      {done && (
        <button onClick={onClose} className="text-xs text-muted hover:text-text">
          Dismiss
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stake                                                               */
/* ------------------------------------------------------------------ */

interface StakeData {
  validators: { poolId: string; stakeNear: number; feePct: number | null }[];
  positions: { poolId: string; staked: string; stakedExact?: string; unstaked: string; stakedYocto: string; unstakedYocto: string; canWithdraw: boolean }[];
}

export function StakePanel({
  accountId,
  overview,
  onPlan,
  refreshKey,
  viewOnly = false,
  onConnect,
}: {
  accountId: string;
  overview: WalletOverview | null;
  onPlan: OnPlan;
  refreshKey: number;
  /** Account shown but not connected: positions are visible, actions need the wallet. */
  viewOnly?: boolean;
  onConnect?: () => void;
}) {
  const data = useApi<StakeData>(`/api/defi/stake?accountId=${encodeURIComponent(accountId)}&r=${refreshKey}`);
  const [pool, setPool] = useState("");
  const [amount, setAmount] = useState("");
  const [unstakeFor, setUnstakeFor] = useState<string | null>(null);
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const { busy, error, run } = useSubmit();
  const pos = useSubmit(); // unstake / withdraw, shown with the positions

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default to the largest low-fee validator once loaded
    if (!pool && data.data?.validators.length) setPool(data.data.validators.find((v) => (v.feePct ?? 100) <= 10)?.poolId ?? data.data.validators[0].poolId);
  }, [data.data, pool]);

  async function stake(e: FormEvent) {
    e.preventDefault();
    const plan = await run(() => api<ReviewPlan>("/api/defi/stake", { method: "POST", json: { action: "stake", from: accountId, pool, amount } }));
    if (plan) onPlan(plan);
  }
  async function doUnstake(poolId: string) {
    const plan = await pos.run(() => api<ReviewPlan>("/api/defi/stake", { method: "POST", json: { action: "unstake", from: accountId, pool: poolId, amount: unstakeAmount } }));
    if (plan) {
      setUnstakeFor(null);
      setUnstakeAmount("");
      onPlan(plan);
    }
  }
  async function withdraw(poolId: string) {
    const plan = await pos.run(() => api<ReviewPlan>("/api/defi/stake", { method: "POST", json: { action: "withdraw", from: accountId, pool: poolId } }));
    if (plan) onPlan(plan);
  }

  const selected = data.data?.validators.find((v) => v.poolId === pool);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<Layers className="h-4 w-4" />}
          title="Your stakes"
          subtitle={`NEAR that ${accountId} has delegated to validators`}
          action={
            <button onClick={() => void data.reload()} className="rounded-lg p-1.5 text-subtle hover:bg-black/[0.04] hover:text-text" aria-label="Refresh staking">
              <RefreshCw className="h-4 w-4" />
            </button>
          }
        />
        {data.loading ? (
          <Skeleton className="h-16" />
        ) : data.data?.positions.length ? (
          <ul className="divide-y divide-border">
            {data.data.positions.map((p) => (
              <li key={p.poolId} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs">{p.poolId}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      Staked <span className="font-mono text-text">{p.staked}</span> NEAR
                      {p.unstakedYocto !== "0" && (
                        <>
                          {" "}
                          · Unstaked <span className="font-mono text-text">{p.unstaked}</span> {p.canWithdraw ? <Badge tone="success">ready to withdraw</Badge> : <Badge tone="neutral">unlocking · ~2–3 days</Badge>}
                        </>
                      )}
                    </div>
                  </div>
                  {viewOnly ? (
                    <Button size="sm" variant="secondary" onClick={onConnect}>
                      Connect to {p.unstakedYocto !== "0" && p.canWithdraw ? "withdraw" : "unstake"}
                    </Button>
                  ) : (
                  <div className="flex gap-1.5">
                    {p.stakedYocto !== "0" && (
                      <Button size="sm" variant="secondary" onClick={() => setUnstakeFor(unstakeFor === p.poolId ? null : p.poolId)}>
                        Unstake
                      </Button>
                    )}
                    {p.unstakedYocto !== "0" && p.canWithdraw && (
                      <Button size="sm" onClick={() => void withdraw(p.poolId)} loading={pos.busy}>
                        Withdraw
                      </Button>
                    )}
                  </div>
                  )}
                </div>
                {!viewOnly && unstakeFor === p.poolId && (
                  <div className="mt-3">
                    <div className="flex gap-2">
                      <AmountInput id={`unstake-${p.poolId}`} value={unstakeAmount} onChange={setUnstakeAmount} onMax={() => setUnstakeAmount(p.stakedExact ?? p.staked)} suffix="NEAR" />
                      <Button onClick={() => void doUnstake(p.poolId)} loading={pos.busy} disabled={!unstakeAmount}>
                        Review
                      </Button>
                    </div>
                    <p className="mt-1.5 text-[0.7rem] text-subtle">Unstaked NEAR stops earning and unlocks in about 2–3 days. Then come back and tap Withdraw to move it to your balance.</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No stakes found for {accountId}. If you staked from a different account, connect that one. A brand-new stake can take a minute to appear — tap refresh.</p>
        )}
        <ErrorLine error={viewOnly ? null : pos.error} />
      </Card>

      {viewOnly ? (
        <Card className="text-center">
          <p className="text-sm text-muted">To stake, unstake or withdraw, connect {accountId}. Your wallet approves each step.</p>
          <Button className="mt-3" onClick={onConnect}>
            Connect {accountId}
          </Button>
        </Card>
      ) : (

      <Card>
        <CardHeader icon={<Layers className="h-4 w-4" />} title="Stake NEAR" subtitle="Earn rewards by delegating to a validator. You keep ownership." />
        {data.error ? (
          <p className="text-sm text-muted">Validators couldn&apos;t be loaded right now. Please try again shortly.</p>
        ) : (
          <form onSubmit={stake} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="stake-pool" hint={selected?.feePct != null ? `Fee ${selected.feePct}% of rewards` : undefined}>
                Validator
              </Label>
              <select id="stake-pool" value={pool} onChange={(e) => setPool(e.target.value)} className="h-11 w-full rounded-xl border border-border-strong bg-bg-2 px-3 text-sm text-text focus:border-accent/60 focus:outline-none">
                {(data.data?.validators ?? []).map((v) => (
                  <option key={v.poolId} value={v.poolId}>
                    {v.poolId} · fee {v.feePct ?? "?"}% · {Intl.NumberFormat("en", { notation: "compact" }).format(v.stakeNear)} NEAR staked
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[0.68rem] text-subtle">Top validators by total stake. Lower fees mean more rewards for you; spreading stake across validators supports decentralisation.</p>
            </div>
            <div>
              <Label htmlFor="stake-amount" hint={`Available: ${overview?.near.spendable ?? "0"} NEAR`}>
                Amount
              </Label>
              <AmountInput id="stake-amount" value={amount} onChange={setAmount} onMax={() => setAmount(overview?.near.spendable ?? "0")} suffix="NEAR" />
            </div>
            <ErrorLine error={error} />
            <Button type="submit" className="w-full" loading={busy} disabled={!pool || !amount}>
              Review stake
            </Button>
            <p className="text-center text-[0.68rem] text-subtle">Minimum 1 NEAR. Unstaking takes about 2–3 days before NEAR can be withdrawn.</p>
          </form>
        )}
      </Card>
      )}
    </div>
  );
}
