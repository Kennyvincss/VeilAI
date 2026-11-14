"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDownLeft, ExternalLink, ArrowDownUp, ArrowUpRight, BookUser, Download, History, KeyRound, Layers, Link2, PlusCircle, RefreshCw, ShieldCheck, Unplug, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useApi, api } from "@/hooks/use-api";
import { ALT_WEB_WALLET, useNearWallet, WEB_WALLET_ID, WEB_WALLET_NAME, WEB_WALLET_URL } from "@/hooks/use-near-wallet";
import { useAppStatus } from "@/components/layout/app-status";
import { PageHeader } from "@/components/layout/dashboard-shell";
import { Button, buttonClass, Card, Skeleton } from "@/components/ui/primitives";
import { WalletOnboarding, type OnboardingMode } from "@/components/wallet/wallet-onboarding";
import { ReviewDialog, type ReviewPlan } from "@/components/wallet/review-dialog";
import { ReceivePanel, SendPanel, StakePanel, SwapPanel, SwapTracker, type WalletOverview } from "@/components/wallet/defi-panels";
import { ActivityPanel, ContactsPanel } from "@/components/wallet/wallet-extras";
import { useContacts } from "@/hooks/use-contacts";
import { CreateNearAccount, type NearAccountOffer } from "@/components/wallet/create-near-account";
import { useRouter } from "next/navigation";
import { cn, formatUsd, shortAccount } from "@/lib/utils/format";

type Tab = "send" | "receive" | "swap" | "stake" | "activity" | "contacts";
const TABS: { id: Tab; label: string; icon: typeof ArrowUpRight }[] = [
  { id: "send", label: "Send", icon: ArrowUpRight },
  { id: "receive", label: "Receive", icon: ArrowDownLeft },
  { id: "swap", label: "Swap", icon: ArrowDownUp },
  { id: "stake", label: "Stake", icon: Layers },
  { id: "activity", label: "Activity", icon: History },
  { id: "contacts", label: "Contacts", icon: BookUser },
];
const isTab = (t: string | null): t is Tab => TABS.some((x) => x.id === t);

export default function WalletPage() {
  return (
    <Suspense>
      <WalletView />
    </Suspense>
  );
}

function WalletView() {
  const { status } = useAppStatus();
  const params = useSearchParams();
  const wallet = useNearWallet(status.network);
  const [onboarding, setOnboarding] = useState<OnboardingMode | null>(null);
  const [tab, setTabState] = useState<Tab>("send");
  const [tabTouched, setTabTouched] = useState(false);
  const setTab = (t: Tab) => {
    setTabTouched(true);
    setTabState(t);
  };
  const [plan, setPlan] = useState<ReviewPlan | null>(null);
  const [pendingDeposit, setPendingDeposit] = useState<string | null>(null);
  const [trackDeposit, setTrackDeposit] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sendTo, setSendTo] = useState<{ to: string; n: number } | null>(null);
  const book = useContacts(status.network);
  const router = useRouter();
  const offer = useApi<NearAccountOffer>("/api/near-account");
  const [creating, setCreating] = useState(false);
  const canCreateHere = Boolean(offer.data?.enabled && offer.data.account?.status !== "created");
  const onCreateHere = canCreateHere
    ? () => {
        setOnboarding(null);
        if (offer.data?.signedIn) setCreating(true);
        else router.push("/signup?next=/dashboard/account%3Fwelcome%3D1");
      }
    : null;
  // The name.near created at sign-up can be viewed (balance, receive, activity)
  // before it's connected; sending, swapping and staking need the wallet.
  const myAccount = offer.data?.account?.status === "created" ? offer.data.account.accountId : null;
  const viewId = wallet.accountId ?? myAccount;
  const viewOnly = !wallet.accountId && Boolean(myAccount);
  // View-only accounts open on Activity (Send/Swap/Stake need the wallet connected).
  const shownTab: Tab = viewOnly && !tabTouched ? "activity" : tab;
  const overview = useApi<WalletOverview>(viewId ? `/api/defi/overview?accountId=${encodeURIComponent(viewId)}&r=${refreshKey}` : null);

  // Deep links: /dashboard/wallet?start=create|import and ?tab=...
  useEffect(() => {
    const start = params.get("start");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open the requested onboarding flow once from the URL
    if (start === "create" || start === "import") setOnboarding(start);
    const t = params.get("tab");
    if (isTab(t)) setTab(t);
  }, [params]);

  const connect = useCallback(async (walletId?: unknown) => {
    try {
      const id = await wallet.connect(typeof walletId === "string" ? walletId : undefined);
      if (id) toast.success(`Connected ${shortAccount(id, 14, 6)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Wallet connection failed");
    }
  }, [wallet]);

  async function approve(p: ReviewPlan): Promise<string[]> {
    return wallet.signAndSend(p.transactions);
  }

  function done(hashes: string[]) {
    if (plan?.kind === "swap" && pendingDeposit) {
      setTrackDeposit(pendingDeposit);
      if (hashes[hashes.length - 1] && wallet.accountId) {
        void api("/api/defi/swap/submit", { method: "POST", json: { txHash: hashes[hashes.length - 1], depositAddress: pendingDeposit, from: wallet.accountId } }).catch(() => undefined);
      }
    }
    setPendingDeposit(null);
    setPlan(null);
    // Balances settle within a block or two.
    setTimeout(() => setRefreshKey((k) => k + 1), 2500);
  }

  return (
    <>
      <PageHeader
        title="Wallet"
        description="Send, receive, swap and stake from your own NEAR wallet. VEIL AI never holds your keys — every transaction is approved in your wallet."
      />

      {status.network === "testnet" && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-[#60a5fa]/30 bg-[#60a5fa]/[0.06] px-4 py-3 text-xs text-accent-2">
          <strong className="font-semibold">NEAR testnet:</strong> test NEAR has no value, so you can try sending and staking freely.
          <a href="https://near-faucet.io" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
            Get free test NEAR →
          </a>
        </div>
      )}

      {!viewId && ((offer.loading && !offer.data) || wallet.restoring) ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading your wallet">
          <Skeleton className="h-36 w-full rounded-[22px]" />
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-[22px]" />
        </div>
      ) : !viewId ? (
        <ConnectHero busy={wallet.busy} onConnect={connect} onCreate={() => setOnboarding("create")} onImport={() => setOnboarding("import")} />
      ) : (
        <>
          <WalletHeader
            accountId={viewId}
            viewOnly={viewOnly}
            busy={wallet.busy}
            onConnect={() => void connect(WEB_WALLET_ID)}
            onShowStake={() => setTab("stake")}
            overview={overview.data}
            loading={overview.loading}
            error={overview.error}
            onRefresh={() => setRefreshKey((k) => k + 1)}
            onDisconnect={async () => {
              await wallet.disconnect();
              toast.success("Wallet disconnected");
            }}
          />

          {viewOnly && <OpenYourAccount accountId={viewId} network={status.network} busy={wallet.busy} onConnect={(id) => void connect(id)} />}

          {trackDeposit && (
            <div className="mt-4">
              <SwapTracker
                depositAddress={trackDeposit}
                onClose={() => {
                  setTrackDeposit(null);
                  setRefreshKey((k) => k + 1);
                }}
              />
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl sm:grid-cols-6 border border-border bg-card p-1" role="tablist" aria-label="Wallet actions">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={shownTab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn("flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-medium transition-colors sm:flex-row sm:justify-center sm:gap-2 sm:text-sm", shownTab === t.id ? "bg-accent/15 text-text" : "text-muted hover:text-text")}
                >
                  <Icon className="h-4 w-4" /> {t.label}
                </button>
              );
            })}
          </div>

          <div className="mx-auto mt-4 max-w-2xl">
            {viewOnly && (shownTab === "send" || shownTab === "swap") && <ConnectToAct accountId={viewId} busy={wallet.busy} onConnect={() => void connect(WEB_WALLET_ID)} />}
            {!viewOnly && wallet.accountId && shownTab === "send" && (
              <SendPanel
                key={sendTo?.n ?? 0}
                accountId={wallet.accountId}
                overview={overview.data}
                onPlan={(p) => setPlan(p)}
                contacts={book.contacts}
                onSaveContact={book.add}
                initialTo={sendTo?.to}
              />
            )}
            {shownTab === "receive" && <ReceivePanel accountId={viewId} network={status.network} />}
            {!viewOnly && wallet.accountId && shownTab === "swap" && (
              <SwapPanel
                accountId={wallet.accountId}
                overview={overview.data}
                onPlan={(p, meta) => {
                  setPendingDeposit(meta?.depositAddress ?? null);
                  setPlan(p);
                }}
              />
            )}
            {shownTab === "activity" && <ActivityPanel accountId={viewId} network={status.network} refreshKey={refreshKey} />}
            {shownTab === "contacts" && (
              <ContactsPanel
                contacts={book.contacts}
                persisted={book.persisted}
                notice={book.notice}
                loading={book.loading}
                onAdd={book.add}
                onRemove={book.remove}
                onSend={(to) => {
                  setSendTo((s) => ({ to, n: (s?.n ?? 0) + 1 }));
                  setTab("send");
                }}
              />
            )}
            {shownTab === "stake" && (
              <StakePanel
                accountId={viewId}
                overview={overview.data}
                onPlan={(p) => setPlan(p)}
                refreshKey={refreshKey}
                viewOnly={viewOnly}
                onConnect={() => void connect(WEB_WALLET_ID)}
              />
            )}
          </div>

          <p className="mx-auto mt-6 flex max-w-2xl items-start gap-2 text-[0.7rem] leading-relaxed text-subtle">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            VEIL AI prepares and explains each transaction; your wallet signs it. Network fees are paid in NEAR by your wallet and are typically under 0.001 NEAR. VEIL AI charges nothing. Not financial advice.
          </p>
        </>
      )}

      <WalletOnboarding
        open={onboarding !== null}
        mode={onboarding ?? "create"}
        onModeChange={setOnboarding}
        onClose={() => setOnboarding(null)}
        onConnect={connect}
        network={status.network}
        onCreateHere={onCreateHere}
        createSuffix={offer.data?.suffix ?? "near"}
      />
      {offer.data && (
        <CreateNearAccount
          open={creating}
          onClose={() => setCreating(false)}
          suffix={offer.data.suffix}
          depositNear={offer.data.depositNear}
          network={status.network}
          onCreated={() => offer.reload()}
        />
      )}
      <ReviewDialog
        plan={plan}
        network={status.network}
        onApprove={approve}
        onCancel={() => {
          setPlan(null);
          setPendingDeposit(null);
        }}
        onDone={done}
      />
    </>
  );
}

function ConnectHero({ busy, onConnect, onCreate, onImport }: { busy: boolean; onConnect: (walletId?: string) => void; onCreate: () => void; onImport: () => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="flex flex-col p-6 md:col-span-3">
        <div className="flex flex-col items-center py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent-strong">
            <Wallet className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">Connect a NEAR wallet to get started</h2>
          <p className="mt-2 max-w-md text-sm text-muted">Your wallet stays in control: VEIL AI can only prepare transactions, and you approve each one in your wallet.</p>
        </div>
      </Card>
      <Card className="flex flex-col p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent-strong">
          <Link2 className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-sm font-semibold">Connect wallet</h3>
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">Have a NEAR wallet? Connect it in one click. Meteor Wallet works right in your browser — nothing to install.</p>
        <Button className="mt-5 w-full" onClick={() => onConnect(WEB_WALLET_ID)} loading={busy}>
          Connect {WEB_WALLET_NAME}
        </Button>
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => onConnect()} disabled={busy}>
          Other wallets (Meteor, HOT…)
        </Button>
      </Card>
      <ChoiceCard icon={<PlusCircle className="h-5 w-5" />} title="Create a new wallet" body="New to NEAR? Get your own name.near right here for free, or create one in a web wallet — no install." cta="Create wallet" onClick={onCreate} />
      <ChoiceCard icon={<Download className="h-5 w-5" />} title="Import existing wallet" body="Have a recovery phrase? Import it in Meteor Wallet on the web (never into VEIL AI), then connect." cta="Import wallet" onClick={onImport} />
      <p className="flex items-center justify-center gap-1.5 text-[0.72rem] text-subtle md:col-span-3">
        <KeyRound className="h-3.5 w-3.5" /> VEIL AI will never ask for your recovery phrase or private key.
      </p>
    </div>
  );
}

function ChoiceCard({ icon, title, body, cta, primary, busy, onClick }: { icon: React.ReactNode; title: string; body: string; cta: string; primary?: boolean; busy?: boolean; onClick: () => void }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent-strong">{icon}</div>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{body}</p>
      <Button className="mt-5 w-full" variant={primary ? "primary" : "secondary"} onClick={onClick} loading={busy}>
        {cta}
      </Button>
    </Card>
  );
}

function WalletHeader({
  accountId,
  overview,
  loading,
  error,
  onRefresh,
  onDisconnect,
  viewOnly = false,
  busy = false,
  onConnect,
  onShowStake,
}: {
  accountId: string;
  overview: WalletOverview | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onDisconnect: () => void;
  viewOnly?: boolean;
  busy?: boolean;
  onConnect?: () => void;
  onShowStake?: () => void;
}) {
  const st = overview?.staking;
  const hasStake = Boolean(st && (st.staked !== "0" || st.unstaked !== "0"));
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted">
            {viewOnly ? (
              <>
                <span className="h-2 w-2 rounded-full bg-warning" aria-hidden /> Your account · view only
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-success" aria-hidden /> Connected
              </>
            )}
          </div>
          <div className="mt-1 truncate font-mono text-sm" title={accountId}>
            {shortAccount(accountId, 22, 8)}
          </div>
          {loading && !overview ? (
            <Skeleton className="mt-3 h-8 w-40" />
          ) : overview ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-2xl font-semibold">{overview.near.spendable} NEAR</span>
              <span className="text-xs text-muted">available</span>
              {overview.totalValueUsd != null && <span className="text-xs text-subtle">· Wallet value {formatUsd(overview.totalValueUsd)}</span>}
            </div>
          ) : (
            error && <p className="mt-2 text-sm text-warning">{error}</p>
          )}
          {hasStake && st && (
            <button onClick={onShowStake} className="mt-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-lavender/35 bg-lavender/10 px-3 py-1 text-xs text-text hover:bg-lavender/20">
              <Layers className="h-3.5 w-3.5 text-accent-strong" />
              Staked <span className="font-mono font-semibold">{st.staked} NEAR</span>
              {st.unstaked !== "0" && <span className="text-muted">· {st.withdrawable ? `${st.unstaked} ready to withdraw` : `${st.unstaked} unlocking`}</span>}
              <span className="text-accent-strong">Manage →</span>
            </button>
          )}
          {overview && overview.tokens.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {overview.tokens.slice(0, 8).map((t) => (
                <span key={t.contractId} className="rounded-lg border border-border bg-bg-2 px-2 py-0.5 font-mono text-[0.7rem] text-muted">
                  {Number(t.amount).toLocaleString("en", { maximumFractionDigits: 4 })} {t.symbol}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" onClick={onRefresh} loading={loading}>
            {!loading && <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </Button>
          {viewOnly ? (
            <Button size="sm" onClick={onConnect} loading={busy}>
              Connect
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onDisconnect}>
              <Unplug className="h-3.5 w-3.5" /> Disconnect
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** First-time help: the account exists, but to approve transactions it must be opened in a wallet once. */
function OpenYourAccount({ accountId, network, busy, onConnect }: { accountId: string; network: "mainnet" | "testnet"; busy: boolean; onConnect: (walletId?: string) => void }) {
  return (
    <Card className="mt-4 border-lavender/35 bg-lavender/[0.07] p-5">
      <h2 className="text-sm font-semibold">Use {accountId} to send, swap and stake</h2>
      <ol className="mt-2 space-y-1.5 text-sm text-muted">
        <li>
          1. Open <strong className="text-text">{WEB_WALLET_NAME}</strong> (web, nothing to install), choose <strong className="text-text">Import</strong> and enter your 12 words there. You only do this once.
        </li>
        <li>
          2. Come back and tap <strong className="text-text">Connect {accountId}</strong>.
        </li>
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={WEB_WALLET_URL[network]} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
          Open {WEB_WALLET_NAME} <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <Button size="sm" onClick={() => onConnect(WEB_WALLET_ID)} loading={busy}>
          Connect {accountId}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onConnect()} disabled={busy}>
          Other wallets
        </Button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Wallet says the account doesn&apos;t exist? {accountId} is live on NEAR, so the words entered don&apos;t match it: check each word&apos;s spelling and order. You can also try{" "}
        <a href={ALT_WEB_WALLET.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-strong underline underline-offset-2">
          {ALT_WEB_WALLET.name}
        </a>
        .
      </p>
      <p className="mt-2 text-[0.7rem] text-subtle">VEIL AI never has your 12 words, so it can&apos;t move funds by itself — your wallet approves every transaction.</p>
    </Card>
  );
}

/** Shown in Send / Swap / Stake while the account is view-only. */
function ConnectToAct({ accountId, busy, onConnect }: { accountId: string; busy: boolean; onConnect: () => void }) {
  return (
    <Card className="p-6 text-center">
      <Wallet className="mx-auto h-8 w-8 text-subtle" />
      <h3 className="mt-3 text-sm font-semibold">Connect {accountId} to continue</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Sending, swapping and staking are approved in your wallet. Receive and Activity work without connecting.</p>
      <Button className="mt-4" onClick={onConnect} loading={busy}>
        Connect {accountId}
      </Button>
    </Card>
  );
}
