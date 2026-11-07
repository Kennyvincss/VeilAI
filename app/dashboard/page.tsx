"use client";

import Link from "next/link";
import { useCallback, useEffect } from "react";
import { Activity, ArrowRight, Coins, Gauge, PieChart as PieIcon, RefreshCw, ShieldCheck, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { NormalizedTx, PortfolioSnapshot, RiskAnalysis } from "@/types";
import { useApi } from "@/hooks/use-api";
import { useAppStatus } from "@/components/layout/app-status";
import { PageHeader } from "@/components/layout/dashboard-shell";
import { WalletManager } from "@/components/wallet/wallet-manager";
import { InsightsCard } from "@/components/dashboard/insights-card";
import { TransactionsList } from "@/components/dashboard/transactions-list";
import { ProvenanceBar } from "@/components/dashboard/sources";
import { AllocationDonut, scoreColor } from "@/components/charts/charts";
import { Badge, Button, buttonClass, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ModeBadge } from "@/components/ui/status";
import { Ago } from "@/components/ui/ago";
import { cn, formatAmount, formatPct, formatUsd } from "@/lib/utils/format";

export default function DashboardPage() {
  const { status } = useAppStatus();
  const portfolio = useApi<PortfolioSnapshot>("/api/portfolio");
  const risk = useApi<RiskAnalysis>("/api/risk");
  const activity = useApi<{ mode: "live" | "demo"; transactions: (NormalizedTx & { wallet?: string })[]; notes: string[] }>("/api/activity");

  const reloadAll = useCallback(() => {
    void portfolio.reload();
    void risk.reload();
    void activity.reload();
  }, [portfolio, risk, activity]);

  // Keep balances and prices current while the dashboard is open and visible.
  const reloadPortfolio = portfolio.reload;
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void reloadPortfolio();
    }, 60_000);
    return () => clearInterval(t);
  }, [reloadPortfolio]);

  const p = portfolio.data;
  const change = p?.change24hPct ?? null;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Your portfolio, risk and confidential processing status at a glance."
        badges={<ModeBadge mode={p?.provenance.mode} />}
        actions={
          <div className="flex items-center gap-3">
            {p && (
              <span className="hidden text-xs text-subtle sm:inline">
                <Ago iso={p.provenance.generatedAt} prefix="Updated " />
              </span>
            )}
            <Button variant="secondary" size="sm" onClick={reloadAll} loading={portfolio.loading}>
              {!portfolio.loading && <RefreshCw className="h-3.5 w-3.5" />} Refresh
            </Button>
          </div>
        }
      />

      {portfolio.error && (
        <div role="alert" className="mb-6 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {portfolio.error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total portfolio value" icon={<Coins className="h-4 w-4" />} loading={portfolio.loading} value={formatUsd(p?.totalValueUsd ?? null, { compact: true })} sub={p ? `${p.holdings.length} assets · ${p.unpricedAssets} unpriced` : undefined} />
        <Kpi
          label="24h change"
          icon={change !== null && change < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
          loading={portfolio.loading}
          value={<span className={cn(change === null ? "" : change >= 0 ? "text-success" : "text-danger")}>{formatPct(change, { sign: true })}</span>}
          sub={p?.change24hUsd !== null && p?.change24hUsd !== undefined ? `${p.change24hUsd >= 0 ? "+" : ""}${formatUsd(p.change24hUsd)}` : "Requires 24h price data"}
        />
        <Kpi label="Tracked wallets" icon={<Wallet className="h-4 w-4" />} loading={portfolio.loading} value={String(p?.wallets.length ?? 0)} sub={p ? `${p.wallets.filter((w) => w.ok).length} reachable` : undefined} />
        <Kpi
          label="Portfolio risk score"
          icon={<Gauge className="h-4 w-4" />}
          loading={risk.loading}
          value={<span style={{ color: risk.data?.overallScore != null ? scoreColor(risk.data.overallScore) : undefined }}>{risk.data?.overallScore != null ? `${Math.round(risk.data.overallScore)}/100` : "—"}</span>}
          sub={risk.data ? risk.data.level.replace("-", " ") : risk.error ? "Unavailable" : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Allocation + holdings */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card>
            <CardHeader icon={<PieIcon className="h-4 w-4" />} title="Asset allocation" subtitle="Priced assets by USD value" />
            {portfolio.loading ? (
              <div className="flex gap-6">
                <Skeleton className="h-40 w-40 rounded-full" />
                <div className="flex-1 space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-4" />
                  ))}
                </div>
              </div>
            ) : p && p.allocation.length > 0 ? (
              <AllocationDonut data={p.allocation} />
            ) : (
              <EmptyState icon={<PieIcon className="h-5 w-5" />} title="No priced assets yet" description="Add a wallet to see how your portfolio is allocated." />
            )}
          </Card>

          <Card>
            <CardHeader icon={<Coins className="h-4 w-4" />} title="Holdings" subtitle="Balances × price · unpriced assets are excluded from totals" />
            {portfolio.loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : p && p.holdings.length > 0 ? (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-[0.7rem] uppercase tracking-wider text-subtle">
                    <tr className="border-b border-border">
                      <th className="px-5 py-2 font-medium">Asset</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-3 py-2 text-right font-medium">Price</th>
                      <th className="px-3 py-2 text-right font-medium">Value</th>
                      <th className="px-5 py-2 text-right font-medium">24h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.holdings.map((h) => (
                      <tr key={h.contractId} className="border-b border-border/60 transition-colors last:border-0 hover:bg-white/[0.02]">
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{h.symbol}</span>
                            {h.contractId === "near:staked" && <Badge tone="blue">Staked</Badge>}
                            {h.isStablecoin && <Badge tone="neutral">Stable</Badge>}
                            {h.priceUsd === null && <Badge tone="warning">Unpriced</Badge>}
                          </div>
                          <div className="max-w-[220px] truncate text-[0.7rem] text-subtle" title={h.contractId}>
                            {h.contractId === "near" || h.contractId === "near:staked" ? "Native NEAR" : h.contractId}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{formatAmount(h.amount)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-muted">{h.priceUsd === null ? "—" : formatUsd(h.priceUsd)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{formatUsd(h.valueUsd)}</td>
                        <td className={cn("px-5 py-2.5 text-right font-mono text-xs", (h.change24hPct ?? 0) >= 0 ? "text-success" : "text-danger")}>{formatPct(h.change24hPct, { sign: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={<Coins className="h-5 w-5" />} title="No holdings" description="Holdings appear once a tracked wallet has balances." />
            )}
            {p && <div className="mt-4"><ProvenanceBar provenance={p.provenance} /></div>}
          </Card>

          <Card>
            <CardHeader
              icon={<Activity className="h-4 w-4" />}
              title="Recent transactions"
              subtitle="Latest activity across tracked wallets"
              action={<ModeBadge mode={activity.data?.mode} />}
            />
            {activity.loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : activity.data && activity.data.transactions.length > 0 ? (
              <TransactionsList txs={activity.data.transactions} network={status.network} demo={activity.data.mode === "demo"} />
            ) : (
              <EmptyState icon={<Activity className="h-5 w-5" />} title="No recent activity" description={activity.error ?? activity.data?.notes[0] ?? "Transactions for tracked wallets will appear here."} />
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="min-w-0 space-y-4">
          <WalletManager onChange={reloadAll} />
          <InsightsCard />
          <PrivacyStatusCard />
          {risk.data && (
            <Card>
              <CardHeader icon={<Gauge className="h-4 w-4" />} title="Top risk drivers" action={<ModeBadge mode={risk.data.provenance.mode} />} />
              <ul className="space-y-2.5">
                {[...risk.data.categories]
                  .filter((c) => c.score !== null)
                  .sort((a, b) => (b.score ?? 0) * b.weight - (a.score ?? 0) * a.weight)
                  .slice(0, 3)
                  .map((c) => (
                    <li key={c.id}>
                      <div className="flex justify-between text-xs">
                        <span>{c.label}</span>
                        <span className="font-mono" style={{ color: scoreColor(c.score ?? 0) }}>
                          {Math.round(c.score ?? 0)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-white/5">
                        <div className="h-full rounded-full" style={{ width: `${c.score}%`, background: scoreColor(c.score ?? 0) }} />
                      </div>
                    </li>
                  ))}
              </ul>
              <Link href="/dashboard/risk-engine" className={buttonClass("ghost", "sm", "mt-4 -ml-2")}>
                Full risk analysis <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, sub, icon, loading }: { label: string; value: React.ReactNode; sub?: string; icon: React.ReactNode; loading?: boolean }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between text-xs text-muted">
        {label}
        <span className="text-subtle">{icon}</span>
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-3 h-7 w-24" />
          <Skeleton className="mt-2 h-3 w-16" />
        </>
      ) : (
        <>
          <div className="mt-2 truncate font-mono text-xl font-semibold tracking-tight sm:text-2xl">{value}</div>
          {sub && <div className="mt-1 truncate text-[0.7rem] capitalize text-subtle">{sub}</div>}
        </>
      )}
    </Card>
  );
}

function PrivacyStatusCard() {
  const { status } = useAppStatus();
  const history = useApi<{ entries: { state: string; createdAt: string; summary: string | null; e2ee: boolean }[]; persisted: boolean }>("/api/privacy/history");
  const last = history.data?.entries[0];
  return (
    <Card>
      <CardHeader icon={<ShieldCheck className="h-4 w-4" />} title="Privacy processing status" subtitle="NEAR AI Cloud · TEE" />
      <dl className="space-y-2 text-xs">
        <Row k="Confidential AI (TEE)" v={status.nearAi.configured ? <Badge tone="success">Online</Badge> : <Badge tone="neutral">Unavailable</Badge>} />
        <Row k="End-to-end encryption" v={status.nearAi.e2ee ? <Badge tone="accent">Enabled</Badge> : <Badge tone="warning">Off</Badge>} />
        <Row k="Stored data" v={<Badge tone="success">Encrypted · owner-only</Badge>} />
        <Row
          k="Last verification"
          v={
            last ? (
              <Badge tone={last.state === "verified" ? "success" : last.state === "failed" ? "danger" : "warning"}>{last.state}</Badge>
            ) : (
              <span className="text-subtle">{history.data?.persisted ? "None yet" : "Not stored for samples"}</span>
            )
          }
        />
      </dl>
      <Link href="/dashboard/privacy" className={buttonClass("secondary", "sm", "mt-4 w-full")}>
        Open Privacy Centre
      </Link>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
