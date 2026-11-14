"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BrainCircuit,
  FileText,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanSearch,
  ShieldCheck,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { NotificationBell, NotificationPoller } from "@/components/notifications/notification-center";
import { Logo } from "@/components/ui/logo";
import { buttonClass } from "@/components/ui/primitives";
import { useAppStatus } from "@/components/layout/app-status";
import { cn } from "@/lib/utils/format";

const NAV_GROUPS: { title: string; items: { href: string; label: string; icon: typeof Wallet }[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
      { href: "/dashboard/analyst", label: "AI Analyst", icon: BrainCircuit },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { href: "/dashboard/wallet-intelligence", label: "Wallet Intelligence", icon: ScanSearch },
      { href: "/dashboard/risk-engine", label: "Risk Engine", icon: Gauge },
      { href: "/dashboard/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    title: "Privacy",
    items: [
      { href: "/dashboard/privacy", label: "Privacy Centre", icon: ShieldCheck },
      { href: "/dashboard/memory", label: "AI Memory", icon: KeyRound },
      { href: "/dashboard/account", label: "Account", icon: UserRound },
    ],
  },
];
export const NAV = NAV_GROUPS.flatMap((g) => g.items);

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status } = useAppStatus();
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- close the mobile drawer on navigation
  useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav className="flex flex-col gap-5" aria-label="Dashboard">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <div className="mb-1.5 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-subtle">{group.title}</div>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2 text-[0.85rem] transition-all",
                    active ? "bg-white font-medium text-text shadow-[0_1px_2px_rgba(18,52,40,0.06)] ring-1 ring-border" : "text-muted hover:bg-black/[0.04] hover:text-text",
                  )}
                >
                  <Icon className={cn("h-4 w-4", active ? "text-text" : "text-subtle group-hover:text-muted")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );


  const account = status.session.signedIn ? (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[180px] truncate text-xs text-muted sm:inline" title={status.session.email ?? undefined}>
        {status.session.email}
      </span>
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/80 text-xs font-semibold uppercase text-text">{(status.session.email ?? "?").slice(0, 1)}</span>
      <form action="/auth/signout" method="post">
        <button type="submit" className="rounded-full px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10">
          <LogOut className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          Log out
        </button>
      </form>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <Link href="/login" className={buttonClass("primary", "sm")}>
        Sign in
      </Link>
    </div>
  );

  return (
    <div className="min-h-screen lg:h-screen lg:p-4 xl:p-5">
      <NotificationPoller />
      <div className="lg:app-window flex min-h-screen flex-col lg:h-full lg:min-h-0 lg:flex-row lg:overflow-hidden lg:rounded-[30px]">
        {/* Desktop sidebar (inside the window) */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-bg-2 px-3 py-5 lg:flex">
          <Link href="/" className="mb-7 px-3" aria-label="VEIL AI home">
            <Logo />
          </Link>
          <div className="flex-1 overflow-y-auto pr-1">{nav}</div>
        </aside>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-xl lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link href="/dashboard" aria-label="Dashboard">
              <Logo />
            </Link>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <button className="rounded-full p-2 text-muted hover:bg-black/[0.04] hover:text-text" onClick={() => setOpen(true)} aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>
        <AnimatePresence>
          {open && (
            <>
              <motion.div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
              <motion.aside
                className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-bg-2 px-3 py-5 lg:hidden"
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation"
              >
                <div className="mb-7 flex items-center justify-between px-3">
                  <Logo />
                  <button onClick={() => setOpen(false)} className="rounded-full p-1.5 text-muted hover:bg-black/[0.04] hover:text-text" aria-label="Close navigation">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">{nav}</div>
                {status.session.signedIn && (
                  <form action="/auth/signout" method="post" className="mt-3 px-1">
                    <button type="submit" className="flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-xs font-medium text-danger hover:bg-danger/10">
                      <LogOut className="h-3.5 w-3.5" /> Log out
                    </button>
                  </form>
                )}
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
          {/* Desktop top bar (inside the window) */}
          <div className="hidden h-16 shrink-0 items-center justify-end gap-4 border-b border-border px-6 lg:flex">
            <div className="flex items-center gap-2">
              <NotificationBell />
              {account}
            </div>
          </div>
          <div id="main-scroll" className="flex-1 lg:overflow-y-auto">
            <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions, badges }: { title: string; description?: ReactNode; actions?: ReactNode; badges?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{title}</h1>
          {badges}
        </div>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
