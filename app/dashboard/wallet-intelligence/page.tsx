"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Activity, AlertTriangle, ArrowRightLeft, BrainCircuit, FileCode2, FlaskConical, Info, ScanSearch, Users } from "lucide-react";
import { toast } from "sonner";
import type { RiskIndicator, WalletIntelReport } from "@/types";
import { api } from "@/hooks/use-api";
import { streamAnalyst } from "@/hooks/use-analyst-stream";
import { useAppStatus } from "@/components/layout/app-status";
import { PageHeader } from "@/components/layout/dashboard-shell";
import { ActivityBars } from "@/components/charts/charts";
import { TransactionsList } from "@/components/dashboard/transactions-list";
import { ProvenanceBar } from "@/components/dashboard/sources";
import { Markdown } from "@/components/analyst/markdown";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Skeleton } from "@/components/ui/primitives";
import { ModeBadge, VerificationBadge } from "@/components/ui/status";
import { isValidAccountId, looksLikeSecret, normalizeAccountId } from "@/lib/near/account";
import { cn, formatAmount, formatDate, shortAccount } from "@/lib/utils/format";
import type { VerificationState } from "@/types";

export default function WalletIntelligencePage() {
  return (
    <Suspense>
      <WalletIntelligence />
    </Suspense>
  );
}

function WalletIntelligence() {
  const params = useSearchParams();
  const { status } = useAppStatus();
  const demo = !status.session.signedIn;
  const [account, setAccount] = useState(params.get("account") ?? "");
  const [report, setReport] = useState<WalletIntelReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auto = useRef(false);

  async function investigate(id: string, sample = false) {
    const acct = normalizeAccountId(id);
    if (looksLikeSecret(id)) {
      setAccount("");
      return setError("That looks like a private key or seed phrase. It was cleared and never sent.");
    }
    if (!isValidAccountId(acct)) return setError("Enter a valid NEAR account ID, e.g. alice.near");
    setError(null);
    setLoading(true);
    try {
      setReport(await api<WalletIntelReport>("/api/wallet/intelligence", { method: "POST", json: { accountId: acct, sample } }));
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "Investigation failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (auto.current) return;
    const a = params.get("account");
    if (a) {
      auto.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time deep-link fetch (?account=…)
      void investigate(a, params.get("sample") === "1");
    }
  }, [params]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void investigate(account);
  }

  return (
    <>
      <PageHeader
        title="Wallet Intelligence"
        description="Investigate any public NEAR account. On-chain facts are separated from heuristic indicators and AI interpretation — no wallet is labelled malicious without sourced evidence."
        badges={report && <ModeBadge mode={report.provenance.mode} />}
      />

      <Card>
        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row" noValidate>
          <Input
            aria-label="Public NEAR account ID"
            placeholder="Public account ID, e.g. alice.near"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-sm"
          />
          <div className="flex gap-2">
            <Button type="submit" loading={loading} className="flex-1 sm:flex-none">
              <ScanSearch className="h-4 w-4" /> Investigate
            </Button>
            <Button type="button" variant="secondary" onClick={() => void investigate(account || "veil-demo-main.near", true)} disabled={loading} title="Run the analysis on sample data">
              <FlaskConical className="h-4 w-4" /> Sample
            </Button>
          </div>
        </form>
        <p className="mt-2 text-[0.7rem] text-subtle">
          Reads public data only (NEAR RPC, NearBlocks, FastNEAR). {demo ? "Demo visitors see the sample investigation; sign in for live lookups." : "Your lookup is not stored."}
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
      </Card>

      {loading && (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-24" />
            </Card>
          ))}
        </div>
      )}

      {!loading && !report && !error && (
        <div className="mt-4">
          <EmptyState icon={<ScanSearch className="h-5 w-5" />} title="Start an investigation" description="Enter a NEAR account to build an intelligence report: overview, activity timeline, statistics, counterparties, contract calls and risk indicators." />
        </div>
      )}

      {report && !loading && <Report report={report} network={status.network} />}
    </>
  );
}

const SEV: Record<RiskIndicator["severity"], "neutral" | "blue" | "warning" | "danger"> = { info: "blue", low: "neutral", medium: "warning", high: "danger" };

function Report({ report, network }: { report: WalletIntelReport; network: "mainnet" | "testnet" }) {
  const o = report.overview;
  const s = report.stats;
  return (
    <div className="mt-4 space-y-4">
      {report.provenance.mode === "demo" && (
        <div className="rounded-xl border border-warning/30 bg-warning/[0.07] px-4 py-3 text-xs text-warning">
          <FlaskConical className="mr-1.5 inline h-3.5 w-3.5" /> Sample investigation — these are not {report.accountId}&apos;s real transactions.
        </div>
      )}

      {/* Overview */}
      <Card>
        <CardHeader icon={<Info className="h-4 w-4" />} title={<span className="font-mono">{shortAccount(report.accountId, 28, 8)}</span>} subtitle="Wallet overview · verified on-chain facts" action={<Badge tone="success">Facts</Badge>} />
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact k="NEAR balance" v={o.nativeNear === null ? "—" : `${formatAmount(o.nativeNear)} NEAR`} />
          <Fact k="Account type" v={o.accountType} />
          <Fact k="Contract deployed" v={o.isContract ? "Yes" : "No"} />
          <Fact k="Tokens held" v={o.tokenCount ?? "—"} />
          <Fact k="Earliest in sample" v={formatDate(o.firstSeen)} />
          <Fact k="Latest activity" v={formatDate(o.lastSeen)} />
          <Fact k="Storage used" v={o.storageUsage === null ? "—" : `${o.storageUsage.toLocaleString()} B`} />
          <Fact k="Indexed transactions" v={s.totalTransactionsIndexed ?? "—"} />
        </dl>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader icon={<Activity className="h-4 w-4" />} title="Activity timeline" subtitle={`Transactions per day · ${s.sampledTransactions} sampled`} />
          {report.timeline.length ? <ActivityBars data={report.timeline} /> : <EmptyState icon={<Activity className="h-5 w-5" />} title="No activity in sample" />}
        </Card>
        <Card>
          <CardHeader icon={<ArrowRightLeft className="h-4 w-4" />} title="Transaction statistics" subtitle="Computed from the sample" />
          <dl className="space-y-2.5 text-sm">
            <Stat k="Transactions / day" v={s.txPerDay ?? "—"} />
            <Stat k="Active days" v={s.activeDays} />
            <Stat k="Failed transactions" v={s.failedTransactions} warn={s.failedTransactions > 0} />
            <Stat k="NEAR received" v={formatAmount(s.nearIn)} />
            <Stat k="NEAR sent" v={formatAmount(s.nearOut)} />
            <Stat k="Unique counterparties" v={s.uniqueCounterparties} />
            <Stat k="Token transfers" v={s.sampledFtTransfers} />
            <Stat k="Sample window" v={s.sampleWindowDays === null ? "—" : `${s.sampleWindowDays} days`} />
          </dl>
        </Card>
      </div>

      {/* Risk indicators */}
      <Card>
        <CardHeader icon={<AlertTriangle className="h-4 w-4" />} title="Risk indicators" subtitle="Heuristics with cited evidence — indicators, not verdicts" action={<Badge tone="warning">Heuristic</Badge>} />
        <ul className="space-y-2.5">
          {report.riskIndicators.map((i) => (
            <li key={i.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={SEV[i.severity]}>{i.severity}</Badge>
                <span className="text-sm font-medium">{i.title}</span>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {i.evidence.map((e) => (
                  <li key={e} className="break-words">
                    • {e}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<Users className="h-4 w-4" />} title="Top counterparties" />
          {report.topCounterparties.length ? (
            <ul className="space-y-1.5">
              {report.topCounterparties.map((c) => (
                <li key={c.account} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-mono" title={c.account}>
                    {shortAccount(c.account, 22, 6)}
                  </span>
                  <span className="shrink-0 text-muted">{c.interactions}×</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">None in sample.</p>
          )}
        </Card>
        <Card>
          <CardHeader icon={<FileCode2 className="h-4 w-4" />} title="Contract interactions" subtitle="Function calls signed by this account" />
          {report.contractInteractions.length ? (
            <ul className="space-y-2">
              {report.contractInteractions.map((c) => (
                <li key={c.contract} className="text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="truncate font-mono" title={c.contract}>
                      {shortAccount(c.contract, 24, 6)}
                    </span>
                    <span className="text-muted">{c.calls} calls</span>
                  </div>
                  {c.methods.length > 0 && <div className="mt-0.5 truncate font-mono text-[0.68rem] text-subtle">{c.methods.join(", ")}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">No function calls in sample.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<ArrowRightLeft className="h-4 w-4" />} title="Large transfers" subtitle="≥ 1,000 NEAR or ≥ 10,000 USD stablecoins" />
          {report.largeTransfers.length ? (
            <ul className="divide-y divide-border">
              {report.largeTransfers.map((t) => (
                <li key={`${t.hash}-${t.asset}`} className="flex items-center justify-between gap-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className={cn("font-medium", t.direction === "in" ? "text-success" : "text-warning")}>
                      {t.direction === "in" ? "Received" : "Sent"} {formatAmount(t.amount)} {t.asset}
                    </div>
                    <div className="truncate font-mono text-[0.68rem] text-subtle">{shortAccount(t.counterparty, 22, 6)}</div>
                  </div>
                  <span className="shrink-0 text-subtle">{formatDate(t.timestamp)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">No large transfers in sample.</p>
          )}
        </Card>
        <Card>
          <CardHeader icon={<Activity className="h-4 w-4" />} title="Recent transactions" />
          {report.recentTransactions.length ? (
            <TransactionsList txs={report.recentTransactions} network={network} demo={report.provenance.mode === "demo"} limit={8} />
          ) : (
            <p className="text-xs text-muted">No transactions available.</p>
          )}
        </Card>
      </div>

      <AiExplanation report={report} />
      <ProvenanceBar provenance={report.provenance} />
    </div>
  );
}

/** AI interpretation, clearly separated from facts. Sends only the aggregated report (counterparties pseudonymised server-side). */
function AiExplanation({ report }: { report: WalletIntelReport }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<VerificationState | null>(null);
  const [running, setRunning] = useState(false);
  const [demoTemplate, setDemoTemplate] = useState(false);

  async function run() {
    setRunning(true);
    setText("");
    const summary = {
      accountType: report.overview.accountType,
      isContract: report.overview.isContract,
      nativeNear: report.overview.nativeNear,
      stats: report.stats,
      indicators: report.riskIndicators.map((i) => ({ severity: i.severity, title: i.title, evidence: i.evidence })),
      contracts: report.contractInteractions.map((c) => ({ contract: c.contract, calls: c.calls, methods: c.methods })),
      largeTransfers: report.largeTransfers.length,
    };
    try {
      await streamAnalyst(
        {
          message: "Explain this public wallet's on-chain behaviour in plain language using the attached wallet_intel data. Separate Facts from Interpretation. Do not call the wallet malicious.",
          attachment: { kind: "wallet_intel", data: summary },
          saveHistory: false,
        },
        (e) => {
          if (e.type === "delta") setText((t) => t + e.text);
          else if (e.type === "status") setState(e.state);
          else if (e.type === "meta") setDemoTemplate(e.inference === "demo-template");
          else if (e.type === "verification") setState(e.result.state);
          else if (e.type === "error") toast.error(e.message);
        },
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<BrainCircuit className="h-4 w-4" />}
        title="AI-generated explanation"
        subtitle="Interpretation — may be wrong; verify against the facts above"
        action={<div className="flex gap-1.5">{demoTemplate && <Badge tone="warning">Demo template</Badge>}{state && <VerificationBadge state={state} />}<Badge tone="accent">AI interpretation</Badge></div>}
      />
      {text ? (
        <Markdown>{text}</Markdown>
      ) : (
        <p className="text-xs text-muted">Ask NEAR AI to explain this wallet. Only the aggregated statistics and indicators above are sent.</p>
      )}
      <Button size="sm" className="mt-4" onClick={run} loading={running}>
        <BrainCircuit className="h-3.5 w-3.5" /> {text ? "Regenerate" : "Explain with AI"}
      </Button>
    </Card>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.7rem] text-subtle">{k}</dt>
      <dd className="mt-0.5 truncate font-mono text-sm capitalize">{v}</dd>
    </div>
  );
}
function Stat({ k, v, warn }: { k: string; v: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={cn("font-mono text-xs", warn && "text-warning")}>{v}</dd>
    </div>
  );
}
