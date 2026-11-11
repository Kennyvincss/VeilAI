"use client";

import { useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, BookUser, Coins, ExternalLink, History, Layers, RefreshCw, Send, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/hooks/use-api";
import type { Contact } from "@/hooks/use-contacts";
import { explorerTx } from "@/components/wallet/review-dialog";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, Skeleton } from "@/components/ui/primitives";
import { isValidAccountId, looksLikeSecret, normalizeAccountId } from "@/lib/near/account";
import { cn, timeAgo } from "@/lib/utils/format";
import type { ActivityItem } from "@/lib/defi/history";

const KIND_ICON: Record<ActivityItem["kind"], typeof Send> = {
  sent: ArrowUpRight,
  received: ArrowDownLeft,
  stake: Layers,
  unstake: Layers,
  withdraw: Layers,
  "token-in": Coins,
  "token-out": Coins,
  call: Zap,
  other: Zap,
};

/** Recent public on-chain activity for the connected account. */
export function ActivityPanel({ accountId, network, refreshKey }: { accountId: string; network: "mainnet" | "testnet"; refreshKey: number }) {
  const [nonce, setNonce] = useState(0);
  const data = useApi<{ items: ActivityItem[]; partial: boolean }>(`/api/defi/history?accountId=${encodeURIComponent(accountId)}&r=${refreshKey}-${nonce}`);
  return (
    <Card>
      <CardHeader
        icon={<History className="h-4 w-4" />}
        title="Activity"
        subtitle="Recent transactions on this account (public on NEAR)"
        action={
          <Button size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)} loading={data.loading} aria-label="Refresh activity">
            {!data.loading && <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        }
      />
      {data.loading && !data.data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : data.error && !data.data ? (
        <p className="text-sm text-warning">{data.error}</p>
      ) : !data.data || data.data.items.length === 0 ? (
        <EmptyState icon={<History className="h-5 w-5" />} title="No activity yet" description="Transactions you make or receive will appear here." />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {data.data.items.map((it) => {
              const Icon = KIND_ICON[it.kind];
              const positive = it.amount?.startsWith("+");
              return (
                <li key={`${it.hash}-${it.kind}-${it.amount}`} className="flex items-center gap-3 py-2.5">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", positive ? "bg-success/10 text-success" : "bg-white/5 text-muted")}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{it.title}</div>
                    <div className="flex items-center gap-2 text-[0.7rem] text-subtle">
                      {timeAgo(it.timestamp)}
                      {it.success === false && <Badge tone="danger">Failed</Badge>}
                      <a href={explorerTx(it.hash, network)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-muted" aria-label="View on explorer">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  {it.amount && <div className={cn("shrink-0 font-mono text-xs", positive ? "text-success" : "text-muted")}>{it.amount}</div>}
                </li>
              );
            })}
          </ul>
          {data.data.partial && <p className="mt-2 text-[0.7rem] text-subtle">Some activity couldn&apos;t be loaded right now; the list may be incomplete.</p>}
        </>
      )}
    </Card>
  );
}

/** Saved contacts: synced and encrypted for account holders, browser-only otherwise. */
export function ContactsPanel({
  contacts,
  persisted,
  notice,
  loading,
  onAdd,
  onRemove,
  onSend,
}: {
  contacts: Contact[];
  persisted: boolean;
  notice: string | null;
  loading: boolean;
  onAdd: (label: string, accountId: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onSend: (accountId: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (looksLikeSecret(label) || looksLikeSecret(account)) {
      setLabel("");
      setAccount("");
      return setError("That looks like a private key or recovery phrase. It was cleared and not saved.");
    }
    const id = normalizeAccountId(account);
    if (!isValidAccountId(id)) return setError("Enter a valid NEAR account, e.g. alice.near");
    if (!label.trim()) return setError("Enter a name");
    setBusy(true);
    try {
      await onAdd(label.trim(), id);
      setLabel("");
      setAccount("");
      toast.success("Contact saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save contact");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<BookUser className="h-4 w-4" />}
        title="Address book"
        subtitle={persisted ? "Encrypted and synced to your account" : "Saved in this browser only — create a free account to sync"}
      />
      {notice && <p className="mb-3 text-xs text-warning">{notice} Contacts are kept in this browser for now.</p>}
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end" noValidate>
        <div>
          <Label htmlFor="c-name">Name</Label>
          <Input id="c-name" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="Alice" className="text-sm" />
        </div>
        <div>
          <Label htmlFor="c-acct">NEAR account</Label>
          <Input id="c-acct" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="alice.near" spellCheck={false} autoComplete="off" className="font-mono text-sm" />
        </div>
        <Button type="submit" loading={busy} disabled={!label || !account}>
          Save
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      <div className="mt-4">
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : contacts.length === 0 ? (
          <p className="text-sm text-muted">No contacts yet. Saved contacts also make look-alike scam addresses easier to catch.</p>
        ) : (
          <ul className="divide-y divide-border">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold uppercase text-accent-strong">{c.label.slice(0, 1)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{c.label}</div>
                  <div className="truncate font-mono text-[0.7rem] text-subtle">{c.accountId}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => onSend(c.accountId)}>
                  <Send className="h-3.5 w-3.5" /> Send
                </Button>
                <button
                  onClick={() => void onRemove(c.id).catch(() => toast.error("Could not delete contact"))}
                  className="rounded-md p-1.5 text-subtle transition hover:bg-danger/10 hover:text-danger"
                  aria-label={`Delete ${c.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
