"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/primitives";

/** Route-level error boundary: a calm message, no stack traces or internals. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Only the digest is shown; details stay in the server logs.
    console.error("VEIL AI page error", error.digest ?? "");
  }, [error]);

  return (
    <main id="main" className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-warning/30 bg-warning/10 text-warning">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">This view couldn&apos;t be loaded. Your data is safe — please try again.</p>
      {error.digest && <p className="mt-3 font-mono text-[0.7rem] text-subtle">Reference: {error.digest}</p>}
      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Button onClick={reset}>
          <RotateCcw className="h-4 w-4" /> Try again
        </Button>
        <Link href="/dashboard" className={buttonClass("secondary", "md")}>
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
