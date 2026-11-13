"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Cpu, Lock, ShieldCheck, Sparkles } from "lucide-react";

/**
 * Illustrative product visual for the landing page. It is labelled as an
 * illustration and uses no real account data.
 */
export function HeroVisual() {
  const reduce = useReducedMotion();
  const bars = [38, 52, 44, 61, 57, 72, 66, 80, 74, 88, 83, 92];
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 30, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto w-full max-w-5xl"
    >
      <div className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[40px] bg-[radial-gradient(ellipse_at_top,rgba(207,195,255,0.55),transparent_60%)] blur-2xl" aria-hidden />
      <div className="glass rounded-3xl p-2 shadow-[0_40px_100px_-40px_rgba(30,55,95,0.45)]">
        <div className="rounded-[20px] border border-border bg-bg-2/90 p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
              <span className="ml-3 hidden text-xs text-subtle sm:inline">veil.ai/dashboard</span>
            </div>
            <span className="rounded-full border border-black/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-wider text-subtle">Product preview</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4 sm:col-span-2">
              <div className="text-xs text-muted">Portfolio value</div>
              <div className="mt-1 font-mono text-2xl font-semibold sm:text-3xl">$24,860.42</div>
              <div className="mt-0.5 text-xs text-success">+2.84% · 24h</div>
              <div className="mt-4 flex h-24 items-end gap-1.5" aria-hidden>
                {bars.map((h, i) => (
                  <motion.div
                    key={i}
                    initial={reduce ? false : { height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ duration: 0.8, delay: 0.5 + i * 0.04 }}
                    className="flex-1 rounded-t-md bg-gradient-to-t from-accent/30 to-accent-strong/80"
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-xs text-muted">Risk score</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="font-mono text-2xl font-semibold text-warning">41</span>
                  <span className="text-xs text-subtle">/ 100</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-black/[0.04]">
                  <div className="h-full w-[41%] rounded-full bg-gradient-to-r from-success via-warning to-warning" />
                </div>
              </div>
              <div className="rounded-2xl border border-success/25 bg-success/[0.06] p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-success">
                  <ShieldCheck className="h-4 w-4" /> TEE attestation verified
                </div>
                <div className="mt-2 space-y-1 font-mono text-[0.65rem] text-muted">
                  <div>✓ Intel TDX quote</div>
                  <div>✓ NVIDIA GPU (NRAS)</div>
                  <div>✓ Fresh nonce bound</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Sparkles className="h-3.5 w-3.5 text-accent-strong" /> AI Financial Analyst
              <span className="ml-auto inline-flex items-center gap-1 text-[0.65rem] text-accent-strong">
                <Lock className="h-3 w-3" /> End-to-end encrypted
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-text/90">
              <span className="text-muted">Facts:</span> NEAR is 64% of priced value; 18% is staked and takes ~2–3 days to unstake.{" "}
              <span className="text-muted">Interpretation:</span> concentration is your largest risk driver…
            </p>
            <div className="mt-3 flex items-center gap-2 text-[0.65rem] text-subtle">
              <Cpu className="h-3 w-3" /> Processed inside a Trusted Execution Environment on NEAR AI Cloud
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
