"use client";

import { useState } from "react";
import { AlertTriangle, BookOpen, ChevronDown, Gauge, RefreshCw, ShieldAlert } from "lucide-react";
import type { RiskAnalysis, RiskCategoryResult } from "@/types";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/dashboard-shell";
import { CategoryBars, ScoreGauge, scoreColor } from "@/components/charts/charts";
import { ProvenanceBar } from "@/components/dashboard/sources";
import { Badge, Button, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ModeBadge } from "@/components/ui/status";
import { cn } from "@/lib/utils/format";

export default function RiskEnginePage() {
  const { data, loading, error, reload } = useApi<RiskAnalysis>("/api/risk");
  return (
    <>
      <PageHeader
        title="Private Risk Engine"
        description="Transparent, deterministic risk scoring over your actual holdings, price history and on-chain activity. Every input is shown."
        badges={<ModeBadge mode={data?.provenance.mode} />}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void reload()} loading={loading}>
            {!loading && <RefreshCw className="h-3.5 w-3.5" />} Recalculate
          </Button>
        }
      />

      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning/[0.06] px-4 py-3 text-xs leading-relaxed text-warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Not investment advice. Scores summarise observable data with disclosed formulas; they do not predict or guarantee outcomes.</span>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <Skeleton className="mx-auto h-32 w-48" />
          </Card>
          <Card className="lg:col-span-2">
            <Skeleton className="h-48" />
          </Card>
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="flex flex-col items-center justify-center">
              <CardHeader icon={<Gauge className="h-4 w-4" />} title="Overall risk score" />
              <ScoreGauge score={data.overallScore} label={data.level.replace("-", " ")} />
              <p className="mt-4 text-center text-xs text-muted">
                Weighted mean of {data.categories.filter((c) => c.score !== null).length} of {data.categories.length} categories with sufficient data.
              </p>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader icon={<ShieldAlert className="h-4 w-4" />} title="Risk categories" subtitle="0 = lower risk · 100 = higher risk · grey = insufficient data" />
              <CategoryBars data={data.categories.map((c) => ({ label: c.label, score: c.score }))} />
            </Card>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.categories.map((c) => (
              <CategoryCard key={c.id} c={c} />
            ))}
          </div>

          <Card className="mt-4">
            <CardHeader icon={<BookOpen className="h-4 w-4" />} title="Methodology" />
            <ul className="space-y-1.5 text-xs leading-relaxed text-muted">
              {data.methodology.map((m) => (
                <li key={m}>• {m}</li>
              ))}
            </ul>
            <p className="mt-4 text-[0.7rem] leading-relaxed text-subtle">{data.disclaimer}</p>
          </Card>
          <div className="mt-4">
            <ProvenanceBar provenance={data.provenance} />
          </div>
        </>
      ) : (
        !error && <EmptyState icon={<Gauge className="h-5 w-5" />} title="No risk analysis yet" description="Add a wallet on the overview page." />
      )}
    </>
  );
}

function CategoryCard({ c }: { c: RiskCategoryResult }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{c.label}</div>
          <div className="text-[0.7rem] text-subtle">Weight {Math.round(c.weight * 100)}%</div>
        </div>
        {c.score === null ? (
          <Badge tone="neutral">Insufficient data</Badge>
        ) : (
          <span className="font-mono text-2xl font-semibold" style={{ color: scoreColor(c.score) }}>
            {Math.round(c.score)}
          </span>
        )}
      </div>
      {c.score !== null && (
        <div className="mt-2 h-1.5 rounded-full bg-black/[0.04]">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${c.score}%`, background: scoreColor(c.score) }} />
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-muted">{c.explanation}</p>
      {c.precautions.length > 0 && (
        <div className="mt-3">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-subtle">Suggested precautions</div>
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            {c.precautions.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
        </div>
      )}
      <button onClick={() => setOpen((v) => !v)} className="mt-3 flex items-center gap-1 text-[0.7rem] text-subtle hover:text-muted" aria-expanded={open}>
        Calculation inputs <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-bg-2/60 p-2.5 font-mono text-[0.68rem]">
          {Object.entries(c.inputs).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="truncate text-subtle">{k}</dt>
              <dd className="truncate text-right text-muted">{v === null ? "n/a" : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
