"use client";

import { useState } from "react";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { api } from "@/hooks/use-api";
import { Button } from "@/components/ui/primitives";

interface Result {
  state: "verified" | "failed" | "unverified";
  checkedAt: string;
  nonce: string;
  checks: { id: string; label: string; status: string; required: boolean }[];
  message: string;
}

/** Asks the server for a fresh, nonce-bound attestation of the proof's signing key. */
export function RecheckEnclave({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<Result>("/api/proof/attest", { method: "POST", json: { token } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check could not run right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <Button size="sm" variant="secondary" onClick={run} loading={busy}>
        {!busy && <RefreshCw className="h-3.5 w-3.5" />} Run fresh check
      </Button>
      {error && <p className="mt-3 text-xs text-warning">{error}</p>}
      {result && (
        <div className="mt-3">
          <p className={`flex items-center gap-2 text-sm font-medium ${result.state === "verified" ? "text-success" : "text-warning"}`}>
            {result.state === "verified" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {result.message}
          </p>
          <p className="mt-1 break-all font-mono text-[0.65rem] text-subtle">
            {new Date(result.checkedAt).toUTCString()} · nonce {result.nonce}
          </p>
          {result.checks.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-xs text-muted">
                  {c.status === "pass" || c.status === "warn" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />}
                  {c.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
