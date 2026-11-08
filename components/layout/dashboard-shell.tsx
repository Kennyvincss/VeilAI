"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BrainCircuit,
  FileText,
  FlaskConical,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanSearch,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { useAppStatus } from "@/components/layout/app-status";
import { LiveStatus } from "@/components/layout/live-status";
import { cn } from "@/lib/utils/format";

export const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/analyst", label: "AI Analyst", icon: BrainCircuit },
  { href: "/dashboard/wallet-intelligence", label: "Wallet Intelligence", icon: ScanSearch },
  { href: "/dashboard/risk-engine", label: "Risk Engine", icon: Gauge },
  { href: "/dashboard/privacy", label: "Privacy Centre", icon: ShieldCheck },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/dashboard/memory", label: "AI Memory", icon: KeyRound },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status } = useAppStatus();
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- close the mobile drawer on navigation
  useEffect(() => setOpen(false), [pathname]);

  const demo = !status.session.signedIn;
  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Dashboard">
      {NAV.map((item) => {
        const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
              active ? "bg-accent/12 text-text shadow-[inset_0_0_0_1px_rgba(139,92,246,0.25)]" : "text-muted hover:bg-white/[0.04] hover:text-text",
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-accent-strong" : "text-subtle group-hover:text-muted")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-bg-2/70 p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted">Confidential AI</span>
          {status.nearAi.configured ? <Badge tone="success">Online</Badge> : <Badge tone="neutral">Unavailable</Badge>}
        </div>
        <div className="mt-2 text-[0.65rem] text-subtle">Runs in a hardware TEE on NEAR AI Cloud</div>
      </div>
      {status.session.signedIn ? (
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="truncate text-xs text-muted" title={status.session.email ?? undefined}>
            {status.session.email}
          </span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="rounded-lg p-2 text-subtle transition-colors hover:bg-white/5 hover:text-text" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      ) : (
        <div className="grid gap-2">
          {status.accounts.enabled && (
            <Link href="/signup" className={buttonClass("primary", "sm", "w-full")}>
              Create free account
            </Link>
          )}
          <a href="/demo/exit" className={buttonClass("ghost", "sm", "w-full")}>
            Exit demo
          </a>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-bg-2/80 px-4 py-5 backdrop-blur-xl lg:flex">
        <Link href="/" className="mb-8 px-2" aria-label="VEIL AI home">
          <Logo />
        </Link>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        {footer}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/dashboard" aria-label="Dashboard">
            <Logo />
          </Link>
          <button className="rounded-lg p-2 text-muted hover:text-text" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-x-auto border-t border-border px-4 py-1.5">
          <LiveStatus className="flex-nowrap whitespace-nowrap" showAi={false} />
        </div>
      </header>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/60 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-bg-2 px-4 py-5 lg:hidden"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
            >
              <div className="mb-8 flex items-center justify-between px-2">
                <Logo />
                <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted hover:text-text" aria-label="Close navigation">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">{nav}</div>
              {footer}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        {/* Desktop top bar: live network status + account */}
        <div className="sticky top-0 z-30 hidden h-12 items-center justify-between border-b border-border bg-bg/80 px-6 backdrop-blur-xl lg:flex">
          <LiveStatus />
          <div className="flex items-center gap-3 text-xs">
            {status.session.signedIn ? (
              <span className="flex items-center gap-2 text-muted">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-[0.7rem] font-semibold uppercase text-accent-strong">
                  {(status.session.email ?? "?").slice(0, 1)}
                </span>
                <span className="max-w-[200px] truncate">{status.session.email}</span>
              </span>
            ) : (
              <>
                <Badge tone="warning">Sample workspace</Badge>
                {status.accounts.enabled && (
                  <Link href="/signup" className={buttonClass("primary", "sm")}>
                    Create free account
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
        {demo && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-warning/20 bg-warning/[0.05] px-4 py-2 text-center text-xs text-warning/90 sm:px-6">
            <span>
              <FlaskConical className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
              You&apos;re viewing a <strong className="font-semibold">sample workspace</strong>: balances, transactions and prices are illustrative, not real accounts.
            </span>
            {status.accounts.enabled && (
              <Link href="/signup" className="font-semibold underline underline-offset-2 hover:text-warning lg:hidden">
                Use your own wallets →
              </Link>
            )}
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions, badges }: { title: string; description?: ReactNode; actions?: ReactNode; badges?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {badges}
        </div>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
