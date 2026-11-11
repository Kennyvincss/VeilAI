"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, Info, Loader2, ShieldAlert, ShieldCheck, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils/format";
import type { PlannedTx } from "@/hooks/use-near-wallet";
import { notify } from "@/components/notifications/notification-center";

export interface ReviewPlan {
  kind: "send" | "stake" | "unstake" | "withdraw" | "swap";
  transactions: PlannedTx[];
  review: { label: string; value: string }[];
  warnings: string[];
  safety?: {
    level: "ok" | "caution" | "danger" | "unknown";
    findings: { id: string; severity: "info" | "caution" | "danger"; title: string; detail: string }[];
  };
}

const TITLES: Record<ReviewPlan["kind"], string> = {
  send: "Review transfer",
  stake: "Review stake",
  unstake: "Review unstake",
  withdraw: "Review withdrawal",
  swap: "Review swap",
};

const SENT_TITLE: Record<ReviewPlan["kind"], string> = { send: "Transfer sent", stake: "Stake submitted", unstake: "Unstake submitted", withdraw: "Withdrawal submitted", swap: "Swap deposit sent" };

/** Notification for a transaction the user just approved in their wallet. */
export function sentNotification(plan: ReviewPlan, hashes: string[]) {
  const first = plan.review[0];
  return {
    id: `sent:${hashes[hashes.length - 1] ?? Date.now()}`,
    kind: (plan.kind === "swap" ? "swap" : plan.kind === "send" ? "sent" : "stake") as "swap" | "sent" | "stake",
    title: SENT_TITLE[plan.kind],
    body: first ? `${first.label}: ${first.value}` : "Submitted to the NEAR network.",
    href: "/dashboard/wallet?tab=activity",
  };
}

export function explorerTx(hash: string, network: "mainnet" | "testnet") {
  return network === "testnet" ? `https://testnet.nearblocks.io/txns/${hash}` : `https://nearblocks.io/txns/${hash}`;
}

/**
 * The mandatory review step. Nothing is sent until the user presses
 * "Approve in wallet" here AND approves again inside their wallet.
 */
export function ReviewDialog({
  plan,
  network,
  onCancel,
  onApprove,
  onDone,
}: {
  plan: ReviewPlan | null;
  network: "mainnet" | "testnet";
  onCancel: () => void;
  onApprove: (plan: ReviewPlan) => Promise<string[]>;
  onDone: (hashes: string[]) => void;
}) {
  const [phase, setPhase] = useState<"review" | "signing" | "done" | "error">("review");
  const [hashes, setHashes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [ack, setAck] = useState(false);
  const needsAck = plan?.safety?.level === "danger";

  const close = () => {
    const wasDone = phase === "done";
    setPhase("review");
    setError(null);
    setShowRaw(false);
    setAck(false);
    if (wasDone && plan) notify(sentNotification(plan, hashes));
    if (wasDone) onDone(hashes);
    else onCancel();
    setHashes([]);
  };

  async function approve() {
    if (!plan) return;
    setPhase("signing");
    setError(null);
    try {
      const h = await onApprove(plan);
      setHashes(h);
      setPhase("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The wallet did not complete the transaction.";
      setError(/reject|denied|cancel|closed/i.test(msg) ? "You cancelled the request in your wallet. Nothing was sent." : msg);
      setPhase("error");
    }
  }

  return (
    <Modal open={plan !== null} onClose={close} title={plan ? (phase === "done" ? "Submitted" : TITLES[plan.kind]) : ""} dismissible={phase !== "signing"}>
      {plan && phase !== "done" && (
        <>
          <dl className="divide-y divide-border rounded-2xl border border-border bg-card">
            {plan.review.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                <dt className="shrink-0 text-muted">{r.label}</dt>
                <dd className="min-w-0 break-all text-right font-medium">{r.value}</dd>
              </div>
            ))}
          </dl>

          {plan.safety && <SafetyPanel safety={plan.safety} />}

          {plan.warnings.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {plan.warnings.map((w) => (
                <li key={w} className="flex gap-2 text-xs leading-relaxed text-warning/90">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}

          <button onClick={() => setShowRaw((v) => !v)} className="mt-4 flex items-center gap-1 text-xs text-subtle hover:text-muted" aria-expanded={showRaw}>
            Exact transaction{plan.transactions.length > 1 ? `s (${plan.transactions.length})` : ""} your wallet will show
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showRaw && "rotate-180")} />
          </button>
          {showRaw && (
            <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-bg p-3 font-mono text-[0.68rem] leading-relaxed text-muted">{JSON.stringify(plan.transactions, null, 2)}</pre>
          )}

          {needsAck && (
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/[0.06] px-3 py-2.5 text-xs leading-relaxed text-text">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-danger)]" />
              I&apos;ve read the warnings above and I&apos;m sure this is the right account.
            </label>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5 text-[0.7rem] text-subtle">
              <ShieldCheck className="h-3.5 w-3.5" /> Your wallet will ask you to approve this again.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={close} disabled={phase === "signing"}>
                Cancel
              </Button>
              <Button onClick={approve} loading={phase === "signing"} disabled={needsAck && !ack}>
                {phase !== "signing" && <Wallet className="h-4 w-4" />} {phase === "signing" ? "Waiting for wallet…" : "Approve in wallet"}
              </Button>
            </div>
          </div>
        </>
      )}

      {plan && phase === "done" && (
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
          <p className="mt-3 text-sm text-muted">
            {plan.kind === "swap" ? "Your deposit was sent. The swap usually completes within a minute — progress is shown below." : "Your transaction was sent to the NEAR network."}
          </p>
          {hashes.length > 0 ? (
            <ul className="mt-4 space-y-1.5">
              {hashes.map((h) => (
                <li key={h}>
                  <a href={explorerTx(h, network)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-accent-strong hover:underline">
                    {h.slice(0, 10)}…{h.slice(-6)} <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-subtle">Your wallet didn&apos;t return a transaction ID. Check your wallet&apos;s activity to confirm.</p>
          )}
          <Button className="mt-6" onClick={close}>
            Done
          </Button>
        </div>
      )}
      {phase === "signing" && <Loader2 className="sr-only" aria-label="Waiting for wallet" />}
    </Modal>
  );
}

const SAFETY_HEAD: Record<NonNullable<ReviewPlan["safety"]>["level"], { title: string; tone: string }> = {
  ok: { title: "Receiver check: nothing unusual found", tone: "border-success/25 bg-success/[0.05] text-success" },
  caution: { title: "Receiver check: please double-check", tone: "border-warning/30 bg-warning/[0.06] text-warning" },
  danger: { title: "Receiver check: this looks risky", tone: "border-danger/35 bg-danger/[0.07] text-danger" },
  unknown: { title: "Receiver check: limited", tone: "border-border bg-bg-2 text-muted" },
};

/** Pre-send safety findings about the receiving account (heuristics, with evidence). */
function SafetyPanel({ safety }: { safety: NonNullable<ReviewPlan["safety"]> }) {
  const head = SAFETY_HEAD[safety.level];
  const Icon = safety.level === "ok" ? ShieldCheck : ShieldAlert;
  return (
    <section className={cn("mt-3 rounded-2xl border px-4 py-3", head.tone)} aria-label="Receiver safety check">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4" /> {head.title}
      </h3>
      <ul className="mt-2 space-y-2">
        {safety.findings.map((f) => (
          <li key={f.id} className="flex gap-2 text-xs leading-relaxed">
            {f.severity === "info" ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" /> : <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", f.severity === "danger" ? "text-danger" : "text-warning")} />}
            <span className="text-muted">
              <span className="font-medium text-text">{f.title}.</span> {f.detail}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[0.65rem] text-subtle">Based on public on-chain activity. These are signals, not proof either way.</p>
    </section>
  );
}
