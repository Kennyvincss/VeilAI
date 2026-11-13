"use client";

import { useState } from "react";
import { BrainCircuit, Download, FileText, Gauge, PieChart, ScanSearch, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { FinancialReport, ReportType } from "@/types";
import { api, useApi } from "@/hooks/use-api";
import { useAppStatus } from "@/components/layout/app-status";
import { PageHeader } from "@/components/layout/dashboard-shell";
import { SourcesList } from "@/components/dashboard/sources";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Toggle } from "@/components/ui/primitives";
import { ModeBadge, VerificationBadge } from "@/components/ui/status";
import { downloadReportPdf } from "@/lib/reports/pdf";
import { isValidAccountId, normalizeAccountId } from "@/lib/near/account";
import { cn, formatDateTime } from "@/lib/utils/format";

const TYPES: { type: ReportType; label: string; desc: string; icon: typeof FileText }[] = [
  { type: "portfolio", label: "Portfolio report", desc: "Holdings, allocation, wallets and valuation method.", icon: PieChart },
  { type: "risk", label: "Risk report", desc: "Seven risk categories with inputs, precautions and methodology.", icon: Gauge },
  { type: "wallet", label: "Wallet intelligence report", desc: "Facts, statistics and evidence-based indicators for any account.", icon: ScanSearch },
  { type: "ai-summary", label: "AI financial summary", desc: "Executive summary from NEAR AI with verification record.", icon: BrainCircuit },
];

export default function ReportsPage() {
  const { status } = useAppStatus();
  const signedIn = status.session.signedIn;
  const saved = useApi<{ reports: { id: string; type: string; title: string; mode: string; createdAt: string }[]; persisted: boolean }>("/api/reports");
  const [type, setType] = useState<ReportType>("portfolio");
  const [account, setAccount] = useState("");
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<FinancialReport | null>(null);

  async function generate() {
    if (type === "wallet" && !isValidAccountId(normalizeAccountId(account))) return toast.error("Enter a valid NEAR account for a wallet report.");
    setBusy(true);
    setReport(null);
    try {
      const r = await api<FinancialReport>("/api/reports", {
        method: "POST",
        json: { type, accountId: type === "wallet" ? normalizeAccountId(account) : undefined, save: signedIn && save },
      });
      setReport(r);
      toast.success(`${r.title} ready`);
      if (r.id) void saved.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function download(r: FinancialReport) {
    try {
      await downloadReportPdf(r);
    } catch {
      toast.error("PDF export failed");
    }
  }

  async function openSaved(id: string, pdf = false) {
    try {
      const r = await api<FinancialReport>(`/api/reports/${id}`);
      setReport(r);
      if (pdf) await download(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open report");
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/reports/${id}`, { method: "DELETE" });
      toast.success("Report deleted");
      void saved.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete report");
    }
  }

  return (
    <>
      <PageHeader title="Financial Reports" description="Generate reports with timestamps, data sources and methodology. PDFs are rendered in your browser." />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader icon={<FileText className="h-4 w-4" />} title="Generate a report" />
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Report type">
            {TYPES.map((t) => {
              const Icon = t.icon;
              const active = t.type === type;
              return (
                <button
                  key={t.type}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setType(t.type)}
                  className={cn("rounded-xl border p-4 text-left transition-all", active ? "border-text bg-white shadow-[0_6px_16px_-10px_rgba(15,17,26,0.35)]" : "border-border hover:border-border-strong")}
                >
                  <Icon className={cn("h-5 w-5", active ? "text-accent-strong" : "text-subtle")} />
                  <div className="mt-3 text-sm font-semibold">{t.label}</div>
                  <div className="mt-1 text-xs leading-relaxed text-muted">{t.desc}</div>
                </button>
              );
            })}
          </div>
          {type === "wallet" && (
            <div className="mt-4">
              <Input aria-label="Account to investigate" placeholder="alice.near" value={account} onChange={(e) => setAccount(e.target.value)} className="font-mono text-sm" />
              {!signedIn && <p className="mt-1 text-[0.7rem] text-subtle">Demo: wallet reports use sample transactions.</p>}
            </div>
          )}
          {type === "ai-summary" && !status.nearAi.configured && (
            <p className="mt-4 rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2 text-xs text-warning">Live AI analysis is unavailable right now: the report will contain the full factual tables, without an AI summary.</p>
          )}
          {signedIn && (
            <div className="mt-4">
              <Toggle id="save-report" checked={save} onChange={setSave} label="Save to my account" description="Stored encrypted with Row Level Security. Off = generated on demand only." />
            </div>
          )}
          <Button className="mt-5 w-full sm:w-auto" onClick={generate} loading={busy}>
            <FileText className="h-4 w-4" /> Generate report
          </Button>
        </Card>

        <Card>
          <CardHeader icon={<FileText className="h-4 w-4" />} title="Saved reports" />
          {!signedIn ? (
            <p className="text-xs text-muted">Create a free account to save reports. Demo reports can still be downloaded as PDF.</p>
          ) : saved.data && saved.data.reports.length > 0 ? (
            <ul className="space-y-2">
              {saved.data.reports.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                  <button className="min-w-0 text-left" onClick={() => void openSaved(r.id)}>
                    <div className="truncate text-sm">{r.title}</div>
                    <div className="text-[0.68rem] text-subtle">
                      {formatDateTime(r.createdAt)} · {r.mode}
                    </div>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => void openSaved(r.id, true)} className="rounded-lg p-1.5 text-subtle hover:bg-black/[0.04] hover:text-text" aria-label={`Download ${r.title}`}>
                      <Download className="h-4 w-4" />
                    </button>
                    <button onClick={() => void remove(r.id)} className="rounded-lg p-1.5 text-subtle hover:bg-danger/10 hover:text-danger" aria-label={`Delete ${r.title}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">{saved.loading ? "Loading…" : "No saved reports yet."}</p>
          )}
        </Card>
      </div>

      <div className="mt-4">
        {report ? (
          <ReportPreview report={report} onDownload={() => void download(report)} />
        ) : (
          <EmptyState icon={<FileText className="h-5 w-5" />} title="No report generated" description="Choose a report type and generate it to preview here, then download as PDF." />
        )}
      </div>
    </>
  );
}

function ReportPreview({ report, onDownload }: { report: FinancialReport; onDownload: () => void }) {
  return (
    <Card>
      <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{report.title}</h2>
            <ModeBadge mode={report.mode} />
            {report.verification && <VerificationBadge state={report.verification.state} />}
          </div>
          <p className="mt-1 text-xs text-muted">
            {report.subject} · generated {formatDateTime(report.generatedAt)}
          </p>
        </div>
        <Button onClick={onDownload}>
          <Download className="h-4 w-4" /> Download PDF
        </Button>
      </div>
      <div className="space-y-6">
        {report.sections.map((s) => (
          <section key={s.heading}>
            <h3 className="text-sm font-semibold">{s.heading}</h3>
            {s.body && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">{s.body}</p>}
            {s.table && (
              <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[520px] text-xs">
                  <thead className="bg-card-2 text-left text-[0.68rem] uppercase tracking-wider text-subtle">
                    <tr>
                      {s.table.columns.map((c) => (
                        <th key={c} className="px-3 py-2 font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.table.rows.map((r, i) => (
                      <tr key={i} className="border-t border-border/60">
                        {r.map((c, j) => (
                          <td key={j} className="px-3 py-2 align-top text-muted">
                            {String(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-semibold text-muted hover:text-text">Data sources</summary>
          <SourcesList className="mt-2" sources={report.sources} />
          {report.sources.length === 0 && <p className="mt-2 text-xs text-muted">Sample data only.</p>}
        </details>
        <section>
          <h3 className="text-sm font-semibold">Methodology</h3>
          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-muted">
            {report.methodology.map((m) => (
              <li key={m}>• {m}</li>
            ))}
          </ul>
        </section>
        <p className="text-[0.7rem] leading-relaxed text-subtle">
          <Badge tone="neutral" className="mr-2">
            Disclaimer
          </Badge>
          {report.disclaimer}
        </p>
      </div>
    </Card>
  );
}
