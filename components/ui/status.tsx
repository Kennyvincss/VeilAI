"use client";

import { CheckCircle2, CircleDashed, FlaskConical, Loader2, Radio, ShieldAlert, ShieldCheck, ShieldOff, ShieldQuestion, XCircle } from "lucide-react";
import type { CheckStatus, DataMode, VerificationState } from "@/types";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils/format";

/** LIVE / DEMO label that must accompany every data view. */
export function ModeBadge({ mode, className }: { mode: DataMode | undefined; className?: string }) {
  if (!mode) return null;
  return mode === "live" ? (
    <Badge tone="success" className={className} title="Fetched from live public providers">
      <Radio className="h-3 w-3" aria-hidden /> Live data
    </Badge>
  ) : (
    <Badge tone="warning" className={className} title="Illustrative sample data — not real">
      <FlaskConical className="h-3 w-3" aria-hidden /> Sample data
    </Badge>
  );
}

const STATE: Record<VerificationState, { label: string; tone: "neutral" | "accent" | "blue" | "success" | "warning" | "danger"; icon: typeof ShieldCheck; spin?: boolean }> = {
  "not-connected": { label: "Not connected", tone: "neutral", icon: ShieldOff },
  initialising: { label: "Initialising", tone: "blue", icon: Loader2, spin: true },
  processing: { label: "Processing", tone: "accent", icon: Loader2, spin: true },
  verifying: { label: "Verifying attestation", tone: "blue", icon: Loader2, spin: true },
  verified: { label: "Verified", tone: "success", icon: ShieldCheck },
  failed: { label: "Verification failed", tone: "danger", icon: ShieldAlert },
  unverified: { label: "Unverified", tone: "warning", icon: ShieldQuestion },
};

export function VerificationBadge({ state, className }: { state: VerificationState; className?: string }) {
  const s = STATE[state];
  const Icon = s.icon;
  return (
    <Badge tone={s.tone} className={className}>
      <Icon className={cn("h-3 w-3", s.spin && "animate-spin")} aria-hidden />
      {state === "not-connected" ? "Unverified · not connected" : s.label}
    </Badge>
  );
}

export function verificationLabel(state: VerificationState) {
  return STATE[state].label;
}

export function CheckIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="pass" />;
  if (status === "fail") return <XCircle className="h-4 w-4 shrink-0 text-danger" aria-label="fail" />;
  if (status === "warn") return <ShieldAlert className="h-4 w-4 shrink-0 text-warning" aria-label="warning" />;
  return <CircleDashed className="h-4 w-4 shrink-0 text-subtle" aria-label="skipped" />;
}
