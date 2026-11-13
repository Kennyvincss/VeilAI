"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { BadgeCheck, Link2, Plus, ScanSearch, Trash2, Unplug, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, useApi } from "@/hooks/use-api";
import { useNearWallet } from "@/hooks/use-near-wallet";
import { useAppStatus } from "@/components/layout/app-status";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Skeleton } from "@/components/ui/primitives";
import { isValidAccountId, looksLikeSecret, normalizeAccountId } from "@/lib/near/account";
import { shortAccount } from "@/lib/utils/format";

interface TrackedWallet {
  id: string;
  accountId: string;
  label: string | null;
  ownershipVerified: boolean;
}

export function WalletManager({ onChange }: { onChange?: () => void }) {
  const { status } = useAppStatus();
  const signedIn = status.session.signedIn;
  const { data, loading, reload } = useApi<{ wallets: TrackedWallet[] }>("/api/wallet/tracked");
  const wallet = useNearWallet(status.network);
  const [input, setInput] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const refresh = async () => {
    await reload();
    onChange?.();
  };

  async function add(e: FormEvent) {
    e.preventDefault();
    const id = normalizeAccountId(input);
    if (looksLikeSecret(input)) {
      setInput("");
      return setInputError("That looks like a private key or seed phrase. It was cleared and never sent. VEIL AI never needs it.");
    }
    if (!isValidAccountId(id)) return setInputError("Enter a valid NEAR account ID, e.g. alice.near");
    setInputError(null);
    setAdding(true);
    try {
      await api("/api/wallet/tracked", { method: "POST", json: { accountId: id, label: label || null } });
      toast.success(`Tracking ${shortAccount(id, 14, 6)}`);
      setInput("");
      setLabel("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add wallet");
    } finally {
      setAdding(false);
    }
  }

  async function connectAndVerify() {
    try {
      const challenge = await api<{ message: string; recipient: string; nonce: string }>("/api/wallet/challenge");
      const proof = await wallet.connectWithProof(challenge);
      await api("/api/wallet/verify", { method: "POST", json: { ...proof, label: "Connected wallet" } });
      toast.success(`Ownership of ${shortAccount(proof.accountId, 14, 6)} verified (NEP-413)`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Wallet connection failed");
    }
  }

  async function connectOnly() {
    try {
      const id = await wallet.connect();
      if (!id) return;
      if (signedIn) {
        await api("/api/wallet/tracked", { method: "POST", json: { accountId: id, label: "Connected wallet" } });
        toast.success(`Tracking ${shortAccount(id, 14, 6)}`);
        await refresh();
      } else toast.success(`Connected ${shortAccount(id, 14, 6)} — create a free account to track it.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Wallet connection failed");
    }
  }

  async function remove(w: TrackedWallet) {
    try {
      await api(`/api/wallet/tracked?id=${encodeURIComponent(w.id)}`, { method: "DELETE" });
      toast.success("Wallet removed");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove wallet");
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<Wallet className="h-4 w-4" />}
        title="Tracked wallets"
        subtitle={`Public NEAR ${status.network} accounts · read-only`}
        action={<Badge tone="neutral">{data?.wallets.length ?? 0} / 10</Badge>}
      />

      {/* Wallet connection */}
      <div className="mb-4 rounded-xl border border-border bg-bg-2/60 p-3">
        {wallet.accountId ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
              <span className="truncate font-mono text-xs" title={wallet.accountId}>
                {shortAccount(wallet.accountId, 16, 6)}
              </span>
            </div>
            <div className="flex gap-1.5">
              <Link href={`/dashboard/wallet-intelligence?account=${encodeURIComponent(wallet.accountId)}`} className="rounded-lg p-1.5 text-subtle hover:bg-white/[0.06] hover:text-text" title="Investigate" aria-label="Investigate connected wallet">
                <ScanSearch className="h-4 w-4" />
              </Link>
              <Button size="sm" variant="ghost" onClick={() => void wallet.disconnect()}>
                <Unplug className="h-3.5 w-3.5" /> Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {signedIn ? (
              <>
                <Button className="w-full whitespace-nowrap" onClick={connectAndVerify} loading={wallet.busy}>
                  {!wallet.busy && <BadgeCheck className="h-4 w-4" />} Connect &amp; verify
                </Button>
                <Button variant="secondary" className="w-full whitespace-nowrap" onClick={connectOnly} disabled={wallet.busy}>
                  <Link2 className="h-4 w-4" /> Connect only
                </Button>
              </>
            ) : (
              <Button variant="secondary" className="w-full whitespace-nowrap" onClick={connectOnly} loading={wallet.busy}>
                <Link2 className="h-3.5 w-3.5" /> Connect NEAR wallet
              </Button>
            )}
          </div>
        )}
        {!wallet.accountId && (
          <p className="mt-2 text-xs text-muted">
            New to NEAR?{" "}
            <Link href="/dashboard/wallet?start=create" className="font-medium text-accent-strong hover:underline">
              Create a wallet
            </Link>{" "}
            ·{" "}
            <Link href="/dashboard/wallet?start=import" className="font-medium text-accent-strong hover:underline">
              Import a wallet
            </Link>
          </p>
        )}
        <p className="mt-2 text-[0.68rem] leading-relaxed text-subtle">
          Ownership proof signs a NEP-413 message — it cannot move funds. VEIL AI never asks for keys or seed phrases; any transaction is approved by you in your wallet.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      ) : data && data.wallets.length > 0 ? (
        <ul className="space-y-2">
          {data.wallets.map((w) => (
            <li key={w.id} className="group flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:border-border-strong">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-xs text-text" title={w.accountId}>
                    {shortAccount(w.accountId, 18, 6)}
                  </span>
                  {w.ownershipVerified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-success" aria-label="Ownership verified" />}
                </div>
                {w.label && <div className="text-[0.7rem] text-subtle">{w.label}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link href={`/dashboard/wallet-intelligence?account=${encodeURIComponent(w.accountId)}`} className="rounded-lg p-1.5 text-subtle hover:bg-white/[0.06] hover:text-text" aria-label={`Investigate ${w.accountId}`}>
                  <ScanSearch className="h-4 w-4" />
                </Link>
                <button onClick={() => void remove(w)} className="rounded-lg p-1.5 text-subtle hover:bg-danger/10 hover:text-danger" aria-label={`Remove ${w.accountId}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Wallet className="h-5 w-5" />} title="No wallets yet" description="Connect a NEAR wallet or paste a public account ID to see live balances and analysis." />
      )}

      {signedIn && (
        <form onSubmit={add} className="mt-4 space-y-2" noValidate>
          <div className="flex gap-2">
            <Input
              aria-label="NEAR account ID"
              placeholder="alice.near"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="h-10 font-mono text-xs"
            />
            <Button type="submit" size="icon" className="h-10 w-10 shrink-0" loading={adding} aria-label="Add wallet">
              {!adding && <Plus className="h-4 w-4" />}
            </Button>
          </div>
          <Input aria-label="Label (optional)" placeholder="Label (optional)" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} className="h-9 text-xs" />
          {inputError && (
            <p role="alert" className="text-xs text-danger">
              {inputError}
            </p>
          )}
        </form>
      )}
    </Card>
  );
}
