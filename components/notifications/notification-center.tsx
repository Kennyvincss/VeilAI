"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowDownUp, ArrowUpRight, Bell, BellOff, BellRing, Info, Layers, Trash2 } from "lucide-react";
import { api } from "@/hooks/use-api";
import { useNearWallet } from "@/hooks/use-near-wallet";
import { useAppStatus } from "@/components/layout/app-status";
import { Button, Card, CardHeader, Toggle } from "@/components/ui/primitives";
import { cn, timeAgo } from "@/lib/utils/format";
import type { ActivityItem } from "@/lib/defi/history";
import { incomingNotifications, mergeNotifications, unstakeReadyNotifications, type AppNotification, type NotificationKind } from "@/lib/notifications";

/* ------------------------------------------------------------------ */
/* Store: this browser only (localStorage), shared by every component. */
/* ------------------------------------------------------------------ */

interface State {
  items: AppNotification[];
  notified: string[];
  browserAlerts: boolean;
  since: Record<string, string>;
}

const KEY = "veil.notifications.v1";
const EMPTY: State = { items: [], notified: [], browserAlerts: false, since: {} };
let state: State | null = null;
const listeners = new Set<() => void>();

function current(): State {
  if (state) return state;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<State>) : {};
    state = {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      notified: Array.isArray(parsed.notified) ? parsed.notified : [],
      browserAlerts: parsed.browserAlerts === true,
      since: parsed.since && typeof parsed.since === "object" ? parsed.since : {},
    };
  } catch {
    state = { ...EMPTY };
  }
  return state;
}

function update(fn: (s: State) => State) {
  state = fn(current());
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: kept in memory for this visit */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function useNotificationState(): State {
  return useSyncExternalStore(subscribe, current, () => EMPTY);
}

function showBrowserAlert(n: Omit<AppNotification, "read">) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const alert = new Notification(n.title, { body: n.body, icon: "/icon-192.png", tag: n.id });
    alert.onclick = () => {
      window.focus();
      if (n.href) window.location.assign(n.href);
      alert.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

/** Add notifications from anywhere in the app (deduplicated by id). */
export function notify(notes: Omit<AppNotification, "read" | "at"> & { at?: string } | (Omit<AppNotification, "read" | "at"> & { at?: string })[]) {
  const list = (Array.isArray(notes) ? notes : [notes]).map((n) => ({ ...n, at: n.at ?? new Date().toISOString() }));
  const known = new Set(current().notified);
  const fresh = list.filter((n) => !known.has(n.id));
  if (fresh.length === 0) return;
  update((s) => ({ ...s, items: mergeNotifications(s.items, fresh), notified: [...fresh.map((n) => n.id), ...s.notified].slice(0, 300) }));
  if (current().browserAlerts) fresh.slice(0, 3).forEach(showBrowserAlert);
}

/* ------------------------------------------------------------------ */
/* Poller: watches the connected wallet while VEIL AI is open.         */
/* ------------------------------------------------------------------ */

const PULSE_MS = 45_000;
const STAKE_MS = 10 * 60_000;

export function NotificationPoller() {
  const { status } = useAppStatus();
  const { accountId } = useNearWallet(status.network);

  useEffect(() => {
    if (!accountId) return;
    let stopped = false;
    let lastFingerprint: string | null = null;
    let lastStakeCheck = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sinceKey = `${status.network}:${accountId}`;
    if (!current().since[sinceKey]) update((s) => ({ ...s, since: { ...s.since, [sinceKey]: new Date().toISOString() } }));

    async function tick() {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const { fingerprint } = await api<{ fingerprint: string }>(`/api/defi/pulse?accountId=${encodeURIComponent(accountId!)}`);
          if (lastFingerprint !== null && fingerprint !== lastFingerprint) {
            const { items } = await api<{ items: ActivityItem[] }>(`/api/defi/history?accountId=${encodeURIComponent(accountId!)}`);
            const since = current().since[sinceKey] ?? new Date().toISOString();
            const { notes, latest } = incomingNotifications(accountId!, items, since, new Set(current().notified));
            update((s) => ({ ...s, since: { ...s.since, [sinceKey]: latest } }));
            notify(notes);
          }
          lastFingerprint = fingerprint;
          if (Date.now() - lastStakeCheck > STAKE_MS) {
            lastStakeCheck = Date.now();
            const { positions } = await api<{ positions: { poolId: string; unstaked: string; unstakedYocto: string; canWithdraw: boolean }[] }>(`/api/defi/stake?accountId=${encodeURIComponent(accountId!)}`);
            notify(unstakeReadyNotifications(positions, new Set(current().notified)));
          }
        } catch {
          /* transient: try again next tick */
        }
      }
      timer = setTimeout(tick, PULSE_MS);
    }
    timer = setTimeout(tick, 1500);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [accountId, status.network]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Bell                                                                */
/* ------------------------------------------------------------------ */

const ICON: Record<NotificationKind, typeof Bell> = { received: ArrowDownLeft, swap: ArrowDownUp, stake: Layers, sent: ArrowUpRight, info: Info };

export function NotificationBell({ className }: { className?: string }) {
  const s = useNotificationState();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const unread = s.items.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next && unread > 0) update((st) => ({ ...st, items: st.items.map((n) => ({ ...n, read: true })) }));
  }

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button onClick={toggle} className="relative rounded-lg p-2 text-muted transition-colors hover:bg-white/[0.06] hover:text-text" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open}>
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.6rem] font-semibold text-white">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-4 top-16 z-50 overflow-hidden rounded-2xl border border-border-strong bg-bg-2 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem]" role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            <div className="flex items-center gap-1">
              {s.items.length > 0 && (
                <button onClick={() => update((st) => ({ ...st, items: [] }))} className="rounded-md p-1.5 text-subtle hover:bg-white/[0.06] hover:text-text" aria-label="Clear all notifications">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <Link href="/dashboard/account" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-[0.7rem] text-muted hover:bg-white/[0.06] hover:text-text">
                Settings
              </Link>
            </div>
          </div>
          {s.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted">No notifications yet. Incoming transfers, swap results and stake updates for your connected wallet appear here.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
              {s.items.map((n) => {
                const Icon = ICON[n.kind];
                const body = (
                  <div className="flex gap-3 px-4 py-3">
                    <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", n.kind === "received" ? "bg-success/10 text-success" : "bg-accent/12 text-accent-strong")}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium">{n.title}</span>
                        {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                      </div>
                      <p className="mt-0.5 break-words text-xs text-muted">{n.body}</p>
                      <p className="mt-1 text-[0.65rem] text-subtle">{timeAgo(n.at)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link href={n.href} onClick={() => setOpen(false)} className="block hover:bg-white/[0.05]">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function NotificationSettings() {
  const s = useNotificationState();
  const permission = useSyncExternalStore(
    subscribe,
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    () => "unsupported",
  );
  const supported = permission !== "unsupported";

  async function setBrowserAlerts(on: boolean) {
    if (on && supported && Notification.permission !== "granted") {
      const result = await Notification.requestPermission();
      if (result !== "granted") return update((st) => ({ ...st, browserAlerts: false }));
    }
    update((st) => ({ ...st, browserAlerts: on }));
    if (on) showBrowserAlert({ id: "test", kind: "info", title: "Browser alerts are on", body: "VEIL AI will alert you here while it's open in a tab.", at: new Date().toISOString() });
  }

  return (
    <Card className="p-6">
      <CardHeader icon={s.browserAlerts ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />} title="Notifications" subtitle="For the wallet connected in this browser" />
      <ul className="space-y-1.5 text-sm text-muted">
        <li>• Money received (NEAR and tokens)</li>
        <li>• Swap completed, refunded or failed</li>
        <li>• Unstaked NEAR ready to withdraw</li>
        <li>• Transactions you sent through VEIL AI</li>
      </ul>
      <div className="mt-5 border-t border-border pt-4">
        {supported ? (
          <Toggle
            id="browser-alerts"
            checked={s.browserAlerts && permission === "granted"}
            onChange={(v) => void setBrowserAlerts(v)}
            label="Browser alerts"
            description={permission === "denied" ? "Blocked in your browser settings — allow notifications for this site to turn them on." : "Pop-up alerts on this device while VEIL AI is open in a tab."}
          />
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted">
            <BellOff className="h-3.5 w-3.5" /> This browser doesn&apos;t support alerts. The bell in the top bar still works.
          </p>
        )}
      </div>
      <p className="mt-4 text-[0.7rem] leading-relaxed text-subtle">
        Notifications are created in your browser from public on-chain activity and stored only on this device. VEIL AI checks while it&apos;s open; it doesn&apos;t track you in the background.
      </p>
      {s.items.length > 0 && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => update((st) => ({ ...st, items: [] }))}>
          <Trash2 className="h-3.5 w-3.5" /> Clear notifications
        </Button>
      )}
    </Card>
  );
}
