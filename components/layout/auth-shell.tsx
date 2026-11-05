import { Suspense, type ReactNode } from "react";
import { Cpu, Lock, ShieldCheck } from "lucide-react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <Suspense>{children}</Suspense>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-border bg-bg-2 lg:flex lg:items-center lg:justify-center">
        <div className="grid-backdrop absolute inset-0" aria-hidden />
        <div className="absolute -right-20 top-1/4 h-96 w-96 rounded-full bg-accent/15 blur-[100px]" aria-hidden />
        <div className="relative max-w-md px-10">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Your financial intelligence.
            <br />
            <span className="text-gradient">Your private data.</span>
            <br />
            Verified by NEAR.
          </h2>
          <ul className="mt-10 space-y-4 text-sm text-muted">
            <li className="flex gap-3">
              <Cpu className="h-5 w-5 shrink-0 text-accent-strong" /> AI inference inside hardware Trusted Execution Environments on NEAR AI Cloud.
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-accent-strong" /> Every answer verified with a fresh-nonce attestation and signature check.
            </li>
            <li className="flex gap-3">
              <Lock className="h-5 w-5 shrink-0 text-accent-strong" /> Row-level security and application-level encryption for anything you choose to save.
            </li>
          </ul>
        </div>
      </aside>
    </main>
  );
}
