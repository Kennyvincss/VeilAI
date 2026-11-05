"use client";

import { useState } from "react";
import { ChevronDown, Cpu, Lock, Server } from "lucide-react";
import type { AttestationTarget, VerificationCheck, VerificationResult } from "@/types";
import { CheckIcon, VerificationBadge } from "@/components/ui/status";
import { Badge } from "@/components/ui/primitives";
import { cn, formatDateTime, shortAccount } from "@/lib/utils/format";

export function CheckRow({ check }: { check: VerificationCheck }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(check.detail || check.expected || check.actual);
  return (
    <li className="rounded-lg border border-border bg-bg-2/50">
      <button
        className={cn("flex w-full items-start gap-2.5 px-3 py-2 text-left", hasDetail && "hover:bg-white/[0.02]")}
        onClick={() => hasDetail && setOpen((v) => !v)}
        aria-expanded={hasDetail ? open : undefined}
        disabled={!hasDetail}
      >
        <CheckIcon status={check.status} />
        <span className="flex-1 text-xs leading-relaxed text-text">
          {check.label}
          {!check.required && <span className="ml-1.5 text-[0.65rem] uppercase tracking-wide text-subtle">advisory</span>}
        </span>
        {hasDetail && <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle transition-transform", open && "rotate-180")} />}
      </button>
      {open && hasDetail && (
        <div className="space-y-1.5 border-t border-border px-3 py-2.5 text-[0.7rem]">
          {check.detail && <p className="whitespace-pre-wrap break-words leading-relaxed text-muted">{check.detail}</p>}
          {check.expected !== undefined && (
            <div className="break-all font-mono text-subtle">
              <span className="text-muted">expected </span>
              {check.expected || "—"}
            </div>
          )}
          {check.actual !== undefined && (
            <div className="break-all font-mono text-subtle">
              <span className="text-muted">actual&nbsp;&nbsp;&nbsp;</span>
              {check.actual || "—"}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function TargetCard({ target }: { target: AttestationTarget }) {
  const Icon = target.kind === "gateway" ? Server : Cpu;
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Icon className="h-4 w-4 text-accent-strong" />
          {target.kind === "gateway" ? "Private inference gateway (CPU TEE)" : "Model enclave (CPU + GPU TEE)"}
        </div>
        <Badge tone={target.verified ? "success" : "danger"}>{target.verified ? "Passed" : "Failed"}</Badge>
      </div>
      <div className="mb-2.5 grid gap-1 font-mono text-[0.65rem] text-subtle sm:grid-cols-2">
        <span className="truncate" title={target.signingAddress ?? ""}>
          signer {target.signingAddress ? shortAccount(target.signingAddress, 10, 8) : "—"} ({target.signingAlgo})
        </span>
        <span>TCB {target.tdxStatus ?? "—"}</span>
        {target.kind === "model" && <span>GPU verdict {target.gpuVerdict ?? "—"}</span>}
        <span className="truncate" title={target.composeHash ?? ""}>
          compose {target.composeHash ? shortAccount(target.composeHash, 10, 6) : "—"}
        </span>
      </div>
      <ul className="space-y-1.5">
        {target.checks.map((c) => (
          <CheckRow key={c.id} check={c} />
        ))}
      </ul>
    </div>
  );
}

export function VerificationDetails({ result, compact }: { result: VerificationResult; compact?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <VerificationBadge state={result.state} />
        {result.e2ee.enabled ? (
          <Badge tone="accent">
            <Lock className="h-3 w-3" /> E2EE · {result.e2ee.algo} v{result.e2ee.version}
          </Badge>
        ) : (
          <Badge tone="neutral" title={result.e2ee.reason}>
            TLS only
          </Badge>
        )}
        <span className="text-[0.7rem] text-subtle">
          {formatDateTime(result.completedAt)} · {(result.durationMs / 1000).toFixed(1)}s
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted">{result.summary}</p>
      {!result.e2ee.enabled && result.e2ee.reason && <p className="text-[0.7rem] text-subtle">E2EE: {result.e2ee.reason}</p>}
      {result.nonce && (
        <div className="break-all rounded-lg bg-bg-2/70 px-3 py-2 font-mono text-[0.65rem] text-subtle">
          <span className="text-muted">fresh nonce </span>
          {result.nonce}
        </div>
      )}
      {result.completionChecks.length > 0 && (
        <div>
          <div className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">This response</div>
          <ul className="space-y-1.5">
            {result.completionChecks.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </ul>
        </div>
      )}
      {!compact &&
        result.targets.map((t, i) => (
          <TargetCard key={`${t.kind}-${i}`} target={t} />
        ))}
      {compact && result.targets.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-[0.7rem] font-semibold uppercase tracking-wider text-subtle hover:text-muted">
            TEE attestation ({result.targets.length}) <ChevronDown className="inline h-3 w-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-2">
            {result.targets.map((t, i) => (
              <TargetCard key={`${t.kind}-${i}`} target={t} />
            ))}
          </div>
        </details>
      )}
      {result.errors.length > 0 && (
        <ul className="space-y-1 text-[0.7rem] text-warning">
          {result.errors.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
