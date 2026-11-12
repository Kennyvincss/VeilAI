import { Suspense, type ReactNode } from "react";
import { Cpu, Lock, ShieldCheck } from "lucide-react";
import { VeilMask } from "@/components/ui/veil-mask";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md rounded-[28px] bg-white/80 p-6 shadow-[0_30px_70px_-35px_rgba(30,55,95,0.4)] ring-1 ring-white/80 backdrop-blur-xl sm:p-8 lg:bg-transparent lg:p-0 lg:shadow-none lg:ring-0 lg:backdrop-blur-none">
          <Suspense>{children}</Suspense>
        </div>
      </div>
      <aside className="hidden items-center justify-center p-6 lg:flex">
        <div className="app-window flex h-full max-h-[760px] w-full max-w-xl flex-col items-center justify-center rounded-[32px] px-10 py-12 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-success/25 bg-success/[0.07] px-3 py-1 text-xs font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Your data stays veiled
          </span>
          <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight">
            Your financial intelligence.
            <br />
            <span className="text-gradient">Your private data.</span>
            <br />
            Verified by NEAR.
          </h2>
          <VeilMask className="my-8 h-48 w-40" />
          <ul className="grid w-full gap-2 text-left text-sm text-muted">
            <li className="flex gap-3 rounded-2xl bg-card-2 px-4 py-3">
              <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-text" /> AI runs inside secure hardware on NEAR AI Cloud.
            </li>
            <li className="flex gap-3 rounded-2xl bg-card-2 px-4 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-text" /> Every answer is checked with a fresh hardware proof and signature.
            </li>
            <li className="flex gap-3 rounded-2xl bg-card-2 px-4 py-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-text" /> Anything you choose to save is encrypted and visible only to you.
            </li>
          </ul>
        </div>
      </aside>
    </main>
  );
}
