"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Database,
  Eye,
  EyeOff,
  History,
  Info,
  KeyRound,
  Loader2,
  Lock,
  MessageSquareLock,
  RotateCcw,
  Server,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import type { VerificationResult, VerificationState } from "@/types";
import { api, useApi } from "@/hooks/use-api";
import { useAppStatus } from "@/components/layout/app-status";
import { PageHeader } from "@/components/layout/dashboard-shell";
import { VerificationDetails } from "@/components/privacy/verification-details";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { VerificationBadge } from "@/components/ui/status";
import { Ago } from "@/components/ui/ago";
import { cn, formatDateTime, shortAccount } from "@/lib/utils/format";

const FLOW: { state: VerificationState; label: string; desc: string }[] = [
  { state: "not-connected", label: "Not connected", desc: "No confidential AI service" },
  { state: "initialising", label: "Initialising", desc: "Fresh 32-byte nonce" },
  { state: "processing", label: "Processing", desc: "Fetching attestation report" },
  { state: "verifying", label: "Verifying attestation", desc: "TDX · GPU · report data · compose" },
  { state: "verified", label: "Verified", desc: "All required checks passed" },
  { state: "failed", label: "Verification failed", desc: "A required check failed" },
];

/** Plain-language progress steps shown while a check runs. */
const STEPS: { state: VerificationState; label: string }[] = [
  { state: "initialising", label: "Contacting the secure AI service" },
  { state: "processing", label: "Collecting proof from the hardware" },
  { state: "verifying", label: "Checking the proof with Intel and NVIDIA" },
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
  const models = useApi<{ configuredModel: string; models: { id: string }[]; available: boolean | null; error?: string }>("/api/privacy/models");
  const history = useApi<{ entries: HistoryEntry[]; persisted: boolean }>("/api/privacy/history");
  const [phase, setPhase] = useState<VerificationState>(status.nearAi.configured ? "initialising" : "not-connected");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const [sessionLog, setSessionLog] = useState<VerificationResult[]>([]);
  const [showTechnical, setShowTechnical] = useState(false);
  const autoRan = useRef(false);
  const reloadHistory = history.reload;

  const verify = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      setRunning(true);
      setRequestFailed(false);
      setPhase("initialising");
      const t1 = setTimeout(() => setPhase("processing"), 600);
      const t2 = setTimeout(() => setPhase("verifying"), 1800);
      try {
        const r = await api<VerificationResult>("/api/privacy/attestation", { method: "POST" });
        setResult(r);
        setPhase(r.state);
        setSessionLog((l) => [r, ...l].slice(0, 20));
        if (!opts.silent) {
          if (r.state === "verified") toast.success("Secure hardware verified");
          else if (r.state === "failed") toast.error("A security check did not pass");
          else toast.warning("The check could not be completed");
        }
        void reloadHistory();
      } catch (err) {
        setRequestFailed(true);
        setPhase("unverified");
        if (!opts.silent) toast.error(err instanceof Error ? err.message : "The check could not be completed");
      } finally {
        clearTimeout(t1);
        clearTimeout(t2);
        setRunning(false);
      }
    },
    [reloadHistory],
  );

  // Run one check automatically when the page opens, so the summary is current.
  useEffect(() => {
    if (autoRan.current || !status.nearAi.configured) return;
    autoRan.current = true;
    void verify({ silent: true });
  }, [status.nearAi.configured, verify]);

  async function clearHistory() {
    try {
      await api("/api/privacy/history", { method: "DELETE" });
      toast.success("History cleared");
      void history.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear history");
    }
  }

  const displayState: VerificationState = !status.nearAi.configured ? "not-connected" : running ? phase : result ? result.state : "unverified";
  const historyEntries: HistoryEntry[] = history.data?.persisted
    ? history.data.entries
    : sessionLog.map((r, i) => ({ id: String(i), kind: "attestation", model: r.model, state: r.state, e2ee: r.e2ee.enabled, nonce: r.nonce, summary: r.summary, durationMs: r.durationMs, createdAt: r.completedAt }));

  return (
    <>
      <PageHeader title="Privacy Centre" description="See how your data is protected — and check it for yourself, any time." />

      {/* 1. Plain-language status */}
      <SummaryCard
        configured={status.nearAi.configured}
        running={running}
        phase={phase}
        result={result}
        requestFailed={requestFailed}
        e2ee={status.nearAi.e2ee}
        onCheck={() => void verify()}
        onShowDetails={() => setShowTechnical(true)}
      />

      {/* 2. What's protected */}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <ProtectionCard
          icon={<MessageSquareLock className="h-5 w-5" />}
          title="Your questions & answers"
          body={
            status.nearAi.e2ee
              ? "Encrypted to the AI's verified secure hardware and processed there — even the operators can't look inside. Each answer shows how it was protected."
              : "Sent securely to the AI and processed inside secure hardware that even the operators can't look into."
          }
        />
        <ProtectionCard
          icon={<Lock className="h-5 w-5" />}
          title="Your saved data"
          body="Chats, preferences and reports are saved only if you choose to, are encrypted, and are visible only to you. You can delete them any time."
        />
        <ProtectionCard
          icon={<Wallet className="h-5 w-5" />}
          title="Your wallets"
          body="Blockchain balances are public by nature. What we keep private is which wallets are yours — the AI only sees labels like “Wallet A”."
        />
      </div>

      {/* 3. Good to know + recent checks */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader icon={<Info className="h-4 w-4" />} title="Good to know" subtitle="We'd rather be clear about the limits" />
          <ul className="space-y-2.5 text-sm leading-relaxed text-muted">
            <li className="flex gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-subtle" />
              VEIL AI&apos;s own server briefly handles your data to prepare each question. It is protected, but it is not secure hardware like the AI itself.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-subtle" />
              To show balances, we look up public blockchain data. Those public services can see which accounts are looked up — never your questions.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-subtle" />
              Anyone can see any NEAR account&apos;s balances and transactions on the blockchain. That is true with or without VEIL AI.
            </li>
            <li className="flex gap-2.5">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
              We will never ask for your seed phrase or private key, and we can never move your funds — every transaction is approved by you in your own wallet.
            </li>
          </ul>
        </Card>

        <Card>
          <CardHeader
            icon={<History className="h-4 w-4" />}
            title="Recent checks"
            subtitle={history.data?.persisted ? "Only the result is kept — never your questions" : "This visit only"}
            action={
              history.data?.persisted && history.data.entries.length > 0 ? (
                <button onClick={clearHistory} className="rounded-lg p-1.5 text-subtle hover:bg-danger/10 hover:text-danger" aria-label="Clear check history">
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : undefined
            }
          />
          <SimpleHistory entries={historyEntries} />
        </Card>
      </div>

      {/* 4. Technical details (collapsed by default) */}
      <div className="mt-6">
        <button
          onClick={() => setShowTechnical((v) => !v)}
          aria-expanded={showTechnical}
          aria-controls="technical-details"
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 px-5 py-4 text-left transition-colors hover:border-border-strong"
        >
          <span>
            <span className="block text-sm font-semibold">{showTechnical ? "Hide technical details" : "Show technical details"}</span>
            <span className="mt-0.5 block text-xs text-muted">Every cryptographic check, the evidence behind it, and a full data-handling breakdown — for experts and auditors.</span>
          </span>
          <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted transition-transform", showTechnical && "rotate-180")} />
        </button>

        <AnimatePresence initial={false}>
          {showTechnical && (
            <motion.div
              id="technical-details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="pt-4">
                <TechnicalDetails
                  status={status}
                  displayState={displayState}
                  result={result}
                  models={models.data}
                  modelsLoading={models.loading}
                  history={historyEntries}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Everyday view                                                       */
/* ------------------------------------------------------------------ */

function SummaryCard(props: {
  configured: boolean;
  running: boolean;
  phase: VerificationState;
  result: VerificationResult | null;
  requestFailed: boolean;
  e2ee: boolean;
  onCheck: () => void;
  onShowDetails: () => void;
}) {
  const { configured, running, phase, result, requestFailed } = props;

  let tone: "success" | "danger" | "warning" | "neutral" | "accent" = "neutral";
  let icon = <ShieldCheck className="h-7 w-7" />;
  let title = "Check that your data is processed in secure hardware";
  let body: React.ReactNode = "It takes a few seconds. We ask the hardware for fresh proof and check it with Intel and NVIDIA.";

  if (!configured) {
    tone = "neutral";
    icon = <ShieldOff className="h-7 w-7" />;
    title = "The secure AI service is currently unavailable";
    body = "While it is offline there is nothing to check, so nothing is shown as verified. AI features will return as soon as it is back.";
  } else if (running) {
    tone = "accent";
    icon = <Loader2 className="h-7 w-7 animate-spin" />;
    title = "Checking the secure hardware…";
    body = null;
  } else if (result?.state === "verified") {
    tone = "success";
    icon = <ShieldCheck className="h-7 w-7" />;
    title = "Your data is processed in verified secure hardware";
    body = (
      <>
        Every security check passed <Ago iso={result.completedAt} prefix="· checked " />.
      </>
    );
  } else if (result?.state === "failed") {
    tone = "danger";
    icon = <AlertTriangle className="h-7 w-7" />;
    title = "We couldn't confirm the secure hardware";
    body = "One of the security checks did not pass, so we are not showing this as verified. Open the technical details to see which one.";
  } else if (result || requestFailed) {
    tone = "warning";
    icon = <AlertTriangle className="h-7 w-7" />;
    title = "The check couldn't be completed right now";
    body = "This is usually temporary. Nothing is shown as verified until a check succeeds — please try again shortly.";
  }

  const ring = {
    success: "border-success/30 bg-[radial-gradient(ellipse_at_top_left,rgba(21,161,80,0.10),transparent_60%)]",
    danger: "border-danger/30 bg-[radial-gradient(ellipse_at_top_left,rgba(239,68,68,0.12),transparent_60%)]",
    warning: "border-warning/30 bg-[radial-gradient(ellipse_at_top_left,rgba(245,158,11,0.10),transparent_60%)]",
    accent: "border-accent/30 bg-[radial-gradient(ellipse_at_top_left,rgba(207,195,255,0.45),transparent_60%)]",
    neutral: "border-border",
  }[tone];
  const iconTone = { success: "bg-success/15 text-success", danger: "bg-danger/15 text-danger", warning: "bg-warning/15 text-warning", accent: "bg-accent/15 text-accent-strong", neutral: "bg-black/[0.04] text-muted" }[tone];

  const verified = !running && result?.state === "verified";

  return (
    <Card className={cn("p-6 sm:p-7", ring)} aria-live="polite">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl", iconTone)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
          {body && <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>}

          {running && (
            <ol className="mt-3 space-y-1.5 text-sm">
              {STEPS.map((s, i) => {
                const idx = STEPS.findIndex((x) => x.state === phase);
                const done = i < idx;
                const active = i === idx;
                return (
                  <li key={s.state} className={cn("flex items-center gap-2", done ? "text-success" : active ? "text-text" : "text-subtle")}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-4 w-4 rounded-full border border-subtle/60" />}
                    {s.label}
                  </li>
                );
              })}
            </ol>
          )}

          {verified && (
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              {[
                "Genuine Intel and NVIDIA secure hardware",
                "Fresh proof, created just now for you",
                "Running exactly the published software",
                "Each AI answer is signed by that hardware and checked",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2 text-text/90">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> {t}
                </li>
              ))}
            </ul>
          )}

          {configured && !running && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={props.onCheck} variant={result ? "secondary" : "primary"}>
                {result ? <RotateCcw className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />} {result ? "Check again" : "Check now"}
              </Button>
              {result && (
                <Button variant="ghost" onClick={props.onShowDetails}>
                  How was this checked?
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function ProtectionCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent-strong">{icon}</div>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
    </Card>
  );
}

const PLAIN_STATE: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
  verified: { label: "Verified", tone: "success" },
  failed: { label: "Check failed", tone: "danger" },
  unverified: { label: "Not completed", tone: "warning" },
  "not-connected": { label: "Unavailable", tone: "neutral" },
};

function SimpleHistory({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) return <p className="text-sm text-muted">No checks yet.</p>;
  return (
    <ul className="max-h-72 divide-y divide-border overflow-y-auto">
      {entries.slice(0, 12).map((e) => {
        const s = PLAIN_STATE[e.state] ?? { label: e.state, tone: "neutral" as const };
        return (
          <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="flex items-center gap-2">
              <Badge tone={s.tone}>{s.label}</Badge>
              <span className="text-muted">{e.kind === "chat" ? "AI answer" : e.kind === "report" ? "Report summary" : "Hardware check"}</span>
              {e.e2ee && <Lock className="h-3.5 w-3.5 text-accent-strong" aria-label="end-to-end encrypted" />}
            </span>
            <span className="shrink-0 text-xs text-subtle">
              <Ago iso={e.createdAt} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Technical details (for experts, auditors and judges)               */
/* ------------------------------------------------------------------ */

function TechnicalDetails({
  status,
  displayState,
  result,
  models,
  modelsLoading,
  history,
}: {
  status: ReturnType<typeof useAppStatus>["status"];
  displayState: VerificationState;
  result: VerificationResult | null;
  models: { configuredModel: string; models: { id: string }[]; available: boolean | null; error?: string } | null;
  modelsLoading: boolean;
  history: HistoryEntry[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusTile icon={<Server className="h-4 w-4" />} label="NEAR AI Cloud" value={status.nearAi.configured ? "Connected" : "Not connected"} tone={status.nearAi.configured ? "success" : "neutral"} sub="Confidential inference provider" />
        <StatusTile
          icon={<Cpu className="h-4 w-4" />}
          label="Confidential inference"
          value={status.nearAi.configured ? "TEE-hosted model" : "Unavailable"}
          tone={status.nearAi.configured ? "accent" : "warning"}
          sub={status.nearAi.configured ? "Intel TDX + NVIDIA confidential computing" : "Service not connected"}
        />
        <StatusTile
          icon={<ShieldCheck className="h-4 w-4" />}
          label="TEE attestation"
          value={displayState === "not-connected" ? "Unverified" : displayState.replace("-", " ")}
          tone={displayState === "verified" ? "success" : displayState === "failed" ? "danger" : "warning"}
          sub={result ? formatDateTime(result.completedAt) : "No check yet"}
        />
        <StatusTile icon={<Lock className="h-4 w-4" />} label="End-to-end encryption" value={status.nearAi.e2ee ? "Enabled" : "Off"} tone={status.nearAi.e2ee ? "accent" : "warning"} sub="Ed25519 · XChaCha20-Poly1305 (v2), attested key only" />
      </div>

      <Card>
        <CardHeader title="Verification lifecycle" subtitle="VERIFIED is only shown when cryptographic verification succeeds. If evidence is unavailable, the state is UNVERIFIED." action={<VerificationBadge state={displayState} />} />
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
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader icon={<ShieldCheck className="h-4 w-4" />} title="Attestation evidence" subtitle="Gateway and model enclaves, verified with NEAR's documented process and a fresh random nonce" />
          {result ? (
            <VerificationDetails result={result} />
          ) : (
            <EmptyState
              icon={<ShieldCheck className="h-5 w-5" />}
              title={status.nearAi.configured ? "No verification run yet" : "UNVERIFIED — confidential AI service not connected"}
              description={status.nearAi.configured ? "Run a check to fetch a fresh attestation report and verify every component." : "There is no attestation evidence to verify. Nothing is shown as verified."}
            />
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader icon={<Cpu className="h-4 w-4" />} title="Model" />
            <dl className="space-y-2 text-xs">
              <Row k="Model" v={<span className="font-mono">{status.nearAi.model}</span>} />
              <Row k="Provider" v="NEAR AI Cloud" />
              <Row
                k="In NEAR AI catalogue"
                v={modelsLoading ? "…" : models?.available === true ? <Badge tone="success">Listed</Badge> : models?.available === false ? <Badge tone="warning">Not listed</Badge> : <Badge tone="neutral">Unknown</Badge>}
              />
            </dl>
            {models?.error && <p className="mt-2 text-[0.68rem] text-subtle">The model catalogue is temporarily unavailable.</p>}
          </Card>

          <Card>
            <CardHeader icon={<History className="h-4 w-4" />} title="Check log" subtitle="Verification metadata only — never prompts or answers" />
            {history.length ? (
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {history.map((e) => (
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
            ) : (
              <p className="text-xs text-muted">No checks recorded yet.</p>
            )}
          </Card>
        </div>
      </div>

      <DataHandling />
    </div>
  );
}

function DataHandling() {
  const rows: [string, string, string, string, string][] = [
    ["Questions & AI answers", "TLS; E2EE to attested enclave when available", "Inside TEE on NEAR AI Cloud", "Only if history is on · encrypted at rest, owner-only access", "Private"],
    ["Portfolio context sent to the model", "TLS; E2EE when available", "Inside TEE · wallet IDs pseudonymised", "Not stored", "Private (derived from public data)"],
    ["Preferences / AI memory", "TLS", "Sent to model only if “use in AI” is on", "Encrypted at rest, owner-only access", "Private"],
    ["Tracked wallet list", "TLS", "Pseudonymised before inference", "Encrypted at rest, owner-only access", "Private (the link between you and the accounts)"],
    ["Balances & transactions", "TLS", "—", "Not stored by VEIL AI", "Public on NEAR"],
    ["Verification metadata", "TLS", "—", "Owner-only access (no content)", "Private"],
  ];
  return (
    <Card>
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
            <li>• VEIL AI&apos;s application server handles your data in plaintext to build context — it is not an enclave.</li>
            <li>• Public data providers (RPC, NearBlocks, FastNEAR, CoinGecko, NEAR Intents) see which public accounts are queried.</li>
            <li>• On-chain balances and transactions are public to everyone, regardless of VEIL AI.</li>
            <li>• Stored data is protected by encryption at rest and per-user access rules, not by the TEE.</li>
          </ul>
        </div>
      </div>
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
      <div className={cn("mt-2 text-base font-semibold first-letter:uppercase", color)}>{value}</div>
      {sub && (
        <div className="mt-0.5 truncate text-[0.68rem] text-subtle" title={sub}>
          {sub}
        </div>
      )}
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
