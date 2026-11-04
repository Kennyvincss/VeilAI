"use client";

import { useState } from "react";
import { Cpu, Database, Eye, EyeOff, History, KeyRound, Lock, Server, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { VerificationResult, VerificationState } from "@/types";
import { api, useApi } from "@/hooks/use-api";
import { useAppStatus } from "@/components/layout/app-status";
import { PageHeader } from "@/components/layout/dashboard-shell";
import { VerificationDetails } from "@/components/privacy/verification-details";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { VerificationBadge } from "@/components/ui/status";
import { cn, formatDateTime, shortAccount } from "@/lib/utils/format";

const FLOW: { state: VerificationState; label: string; desc: string }[] = [
  { state: "not-connected", label: "Not connected", desc: "No NEAR AI credentials" },
  { state: "initialising", label: "Initialising", desc: "Fresh 32-byte nonce" },
  { state: "processing", label: "Processing", desc: "Fetching attestation report" },
  { state: "verifying", label: "Verifying attestation", desc: "TDX · GPU · report data · compose" },
  { state: "verified", label: "Verified", desc: "All required checks passed" },
  { state: "failed", label: "Verification failed", desc: "A required check failed" },
];

interface HistoryEntry {
  id: string;
  kind: string;
  model: string | null;
  state: string;
  e2ee: boolean;
  nonce: string | null;
  summary: string | null;
  durationMs: number | null;
  createdAt: string;
}

export default function PrivacyCentrePage() {
  const { status } = useAppStatus();
  const models = useApi<{ configuredModel: string; baseUrl: string; models: { id: string }[]; available: boolean | null; error?: string }>("/api/privacy/models");
  const history = useApi<{ entries: HistoryEntry[]; persisted: boolean }>("/api/privacy/history");
  const [phase, setPhase] = useState<VerificationState>(status.nearAi.configured ? "initialising" : "not-connected");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [sessionLog, setSessionLog] = useState<VerificationResult[]>([]);

  async function verify() {
    setRunning(true);
    setResult(null);
    setPhase("initialising");
    const t1 = setTimeout(() => setPhase("processing"), 400);
    const t2 = setTimeout(() => setPhase("verifying"), 1600);
    try {
      const r = await api<VerificationResult>("/api/privacy/attestation", { method: "POST" });
      setResult(r);
      setPhase(r.state);
      setSessionLog((l) => [r, ...l].slice(0, 20));
      if (r.state === "verified") toast.success("TEE attestation verified");
      else if (r.state === "failed") toast.error("Attestation verification failed — see details");
      else toast.warning("Attestation unverified");
      void history.reload();
    } catch (err) {
      setPhase("unverified");
      toast.error(err instanceof Error ? err.message : "Verification request failed");
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setRunning(false);
    }
  }

  async function clearHistory() {
    try {
      await api("/api/privacy/history", { method: "DELETE" });
      toast.success("Processing history cleared");
      void history.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear history");
    }
  }

  const displayState: VerificationState = !status.nearAi.configured ? "not-connected" : result ? result.state : running ? phase : "unverified";

  return (
    <>
      <PageHeader
        title="Privacy Centre"
        description="Live evidence of how VEIL AI processes your data: NEAR AI Cloud connectivity, TEE attestation verified with fresh nonces, and an honest map of what is and isn't protected."
        badges={<VerificationBadge state={displayState} />}
        actions={
          <Button onClick={verify} loading={running} disabled={!status.nearAi.configured}>
            <ShieldCheck className="h-4 w-4" /> Verify attestation now
          </Button>
        }
      />

      {/* Status grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusTile icon={<Server className="h-4 w-4" />} label="NEAR AI Cloud" value={status.nearAi.configured ? "Connected" : "Not connected"} tone={status.nearAi.configured ? "success" : "neutral"} sub={status.nearAi.baseUrl} />
        <StatusTile
          icon={<Cpu className="h-4 w-4" />}
          label="Confidential inference"
          value={status.nearAi.configured ? "TEE-hosted model" : "Demo templates only"}
          tone={status.nearAi.configured ? "accent" : "warning"}
          sub={status.nearAi.configured ? "Intel TDX + NVIDIA confidential computing" : "Set NEAR_AI_API_KEY to enable"}
        />
        <StatusTile icon={<ShieldCheck className="h-4 w-4" />} label="TEE verification" value={displayState === "not-connected" ? "Unverified" : displayState.replace("-", " ")} tone={displayState === "verified" ? "success" : displayState === "failed" ? "danger" : "warning"} sub={result ? formatDateTime(result.completedAt) : "Run a verification to check"} />
        <StatusTile
          icon={<Lock className="h-4 w-4" />}
          label="End-to-end encryption"
          value={status.nearAi.e2eeMode === "off" ? "Off" : status.nearAi.e2eeMode === "required" ? "Required" : "Preferred"}
          tone={status.nearAi.e2eeMode === "off" ? "warning" : "accent"}
          sub="Ed25519 · XChaCha20-Poly1305 (v2), attested key only"
        />
      </div>

      {/* State machine */}
      <Card className="mt-4">
        <CardHeader title="Verification lifecycle" subtitle="VERIFIED is only shown when cryptographic verification succeeds. If evidence is unavailable, the state is UNVERIFIED." />
        <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {FLOW.map((f) => {
            const active = f.state === displayState;
            return (
              <li
                key={f.state}
                className={cn(
                  "rounded-xl border p-3 transition-all",
                  active
                    ? f.state === "verified"
                      ? "border-success/50 bg-success/[0.08]"
                      : f.state === "failed"
                        ? "border-danger/50 bg-danger/[0.08]"
                        : "border-accent/50 bg-accent/[0.08]"
                    : "border-border opacity-60",
                )}
                aria-current={active ? "step" : undefined}
              >
                <div className="text-xs font-semibold">{f.label}</div>
                <div className="mt-0.5 text-[0.68rem] text-subtle">{f.desc}</div>
              </li>
            );
          })}
        </ol>
        {displayState === "unverified" && <p className="mt-3 text-xs text-warning">Current state: UNVERIFIED — no successful verification in this session.</p>}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Attestation results */}
        <Card>
          <CardHeader icon={<ShieldCheck className="h-4 w-4" />} title="Attestation verification results" subtitle="Gateway + model enclaves, verified with NEAR's documented process" />
          {result ? (
            <VerificationDetails result={result} />
          ) : (
            <EmptyState
              icon={<ShieldCheck className="h-5 w-5" />}
              title={status.nearAi.configured ? "No verification run yet" : "UNVERIFIED — NEAR AI Cloud not connected"}
              description={
                status.nearAi.configured
                  ? "Click “Verify attestation now” to fetch a fresh attestation report with a random nonce and verify every component."
                  : "This deployment has no NEAR AI Cloud API key, so no attestation evidence exists. Nothing is displayed as verified."
              }
            />
          )}
        </Card>

        <div className="space-y-4">
          {/* Model info */}
          <Card>
            <CardHeader icon={<Cpu className="h-4 w-4" />} title="Model information" />
            <dl className="space-y-2 text-xs">
              <Row k="Configured model" v={<span className="font-mono">{status.nearAi.model}</span>} />
              <Row k="Gateway" v={<span className="font-mono">{status.nearAi.baseUrl.replace("https://", "")}</span>} />
              <Row
                k="In NEAR AI catalogue"
                v={models.loading ? "…" : models.data?.available === true ? <Badge tone="success">Listed</Badge> : models.data?.available === false ? <Badge tone="warning">Not listed</Badge> : <Badge tone="neutral">Unknown</Badge>}
              />
              <Row k="Catalogue size" v={models.data?.models.length ? `${models.data.models.length} models` : "—"} />
            </dl>
            {models.data?.error && <p className="mt-2 text-[0.68rem] text-subtle">Catalogue unavailable: {models.data.error}</p>}
            {models.data && models.data.models.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[0.7rem] text-subtle hover:text-muted">Available models</summary>
                <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto font-mono text-[0.65rem] text-muted">
                  {models.data.models.map((m) => (
                    <li key={m.id}>{m.id}</li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          {/* Processing history */}
          <Card>
            <CardHeader
              icon={<History className="h-4 w-4" />}
              title="Processing history"
              subtitle={history.data?.persisted ? "Verification metadata only — never prompts or answers" : "This session only (demo)"}
              action={
                history.data?.persisted && history.data.entries.length > 0 ? (
                  <button onClick={clearHistory} className="rounded-lg p-1.5 text-subtle hover:bg-danger/10 hover:text-danger" aria-label="Clear processing history">
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : undefined
              }
            />
            <HistoryList entries={history.data?.persisted ? history.data.entries : sessionLog.map((r, i) => ({ id: String(i), kind: "attestation", model: r.model, state: r.state, e2ee: r.e2ee.enabled, nonce: r.nonce, summary: r.summary, durationMs: r.durationMs, createdAt: r.completedAt }))} />
          </Card>
        </div>
      </div>

      <DataHandling encryption={status.dataEncryption.configured} />
    </>
  );
}

function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) return <p className="text-xs text-muted">No confidential processing recorded yet.</p>;
  return (
    <ul className="max-h-80 space-y-2 overflow-y-auto">
      {entries.map((e) => (
        <li key={e.id} className="rounded-lg border border-border p-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Badge tone={e.state === "verified" ? "success" : e.state === "failed" ? "danger" : "warning"}>{e.state}</Badge>
              <span className="capitalize text-muted">{e.kind}</span>
              {e.e2ee && <Lock className="h-3 w-3 text-accent-strong" aria-label="end-to-end encrypted" />}
            </span>
            <span className="text-[0.65rem] text-subtle">{formatDateTime(e.createdAt)}</span>
          </div>
          {e.nonce && <div className="mt-1 truncate font-mono text-[0.62rem] text-subtle">nonce {shortAccount(e.nonce, 12, 8)}</div>}
        </li>
      ))}
    </ul>
  );
}

function DataHandling({ encryption }: { encryption: boolean }) {
  const rows: [string, string, string, string, string][] = [
    ["Questions & AI answers", "TLS; E2EE to attested enclave when available", "Inside TEE on NEAR AI Cloud", encryption ? "Only if history is on · AES-256-GCM + Supabase disk encryption" : "Only if history is on · Supabase disk encryption (app-level key not set)", "Private"],
    ["Portfolio context sent to the model", "TLS; E2EE when available", "Inside TEE · wallet IDs pseudonymised", "Not stored", "Private (derived from public data)"],
    ["Preferences / AI memory", "TLS", "Sent to model only if “use in AI” is on", encryption ? "Supabase + RLS · goals AES-256-GCM" : "Supabase + RLS", "Private"],
    ["Tracked wallet list", "TLS", "Pseudonymised before inference", "Supabase + RLS", "Private (the link between you and the accounts)"],
    ["Balances & transactions", "TLS", "—", "Not stored by VEIL AI", "Public on NEAR"],
    ["Verification metadata", "TLS", "—", "Supabase + RLS (no content)", "Private"],
  ];
  return (
    <Card className="mt-4">
      <CardHeader icon={<Database className="h-4 w-4" />} title="Data handling" subtitle="Where each kind of data is protected — and where it isn't" />
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="text-[0.68rem] uppercase tracking-wider text-subtle">
            <tr className="border-b border-border">
              <th className="px-5 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">In transit</th>
              <th className="px-3 py-2 font-medium">During computation</th>
              <th className="px-3 py-2 font-medium">At rest</th>
              <th className="px-5 py-2 font-medium">Nature</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-2.5 font-medium text-text">{r[0]}</td>
                <td className="px-3 py-2.5 text-muted">{r[1]}</td>
                <td className="px-3 py-2.5 text-muted">{r[2]}</td>
                <td className="px-3 py-2.5 text-muted">{r[3]}</td>
                <td className="px-5 py-2.5 text-muted">{r[4]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-success/25 bg-success/[0.05] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-success">
            <Eye className="h-4 w-4" /> Protected
          </div>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
            <li>• Model inference runs inside Intel TDX + NVIDIA GPU TEEs; operators cannot read memory during computation.</li>
            <li>• With E2EE, the NEAR AI gateway only relays ciphertext encrypted to an enclave key verified with a fresh nonce.</li>
            <li>• Each response is signed inside the enclave; VEIL AI checks the hashes of exactly what was sent and received.</li>
            <li>• Stored rows are isolated per user with Postgres Row Level Security.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-warning/25 bg-warning/[0.05] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-warning">
            <EyeOff className="h-4 w-4" /> Not protected by the TEE
          </div>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
            <li>• VEIL AI&apos;s own server (Vercel) handles your data in plaintext to build context — it is not an enclave.</li>
            <li>• Public data providers (RPC, NearBlocks, FastNEAR, CoinGecko, NEAR Intents) see which public accounts are queried.</li>
            <li>• On-chain balances and transactions are public to everyone, regardless of VEIL AI.</li>
            <li>• Supabase can access stored rows at the infrastructure level; app-level encryption {encryption ? "is ON for messages and goals" : "is OFF on this deployment"}.</li>
          </ul>
        </div>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[0.7rem] text-subtle">
        <KeyRound className="h-3.5 w-3.5" /> VEIL AI never collects seed phrases or private keys and never executes transactions.
      </p>
    </Card>
  );
}

function StatusTile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone: "success" | "neutral" | "warning" | "danger" | "accent" }) {
  const color = { success: "text-success", neutral: "text-muted", warning: "text-warning", danger: "text-danger", accent: "text-accent-strong" }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted">
        {label}
        <span className="text-subtle">{icon}</span>
      </div>
      <div className={cn("mt-2 text-base font-semibold capitalize", color)}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[0.68rem] text-subtle" title={sub}>{sub}</div>}
    </Card>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="truncate">{v}</dd>
    </div>
  );
}
