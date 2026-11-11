import type { ActivityItem } from "@/lib/defi/history";

/**
 * Notification rules (pure, client-safe). Notifications are created in the
 * browser from public on-chain activity and app events; they are stored
 * only in this browser.
 */

export type NotificationKind = "received" | "swap" | "stake" | "sent" | "info";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  at: string;
  read: boolean;
  href?: string;
}

export const MAX_NOTIFICATIONS = 50;

/**
 * Incoming transfers newer than `since` that haven't been notified yet.
 * Returns the notifications plus the new high-water mark.
 */
export function incomingNotifications(
  accountId: string,
  items: ActivityItem[],
  since: string,
  alreadyNotified: Set<string>,
): { notes: Omit<AppNotification, "read">[]; latest: string } {
  let latest = since;
  const notes: Omit<AppNotification, "read">[] = [];
  for (const it of items) {
    if (it.timestamp > latest) latest = it.timestamp;
    if (it.timestamp <= since) continue;
    if (it.kind !== "received" && it.kind !== "token-in") continue;
    if (it.success === false) continue;
    const id = `in:${it.hash}:${it.amount ?? ""}`;
    if (alreadyNotified.has(id)) continue;
    notes.push({
      id,
      kind: "received",
      title: `Received ${it.amount?.replace(/^\+/, "") ?? "funds"}`,
      body: `${it.counterparty ? `From ${it.counterparty}` : "Incoming transfer"} to ${accountId}`,
      at: it.timestamp,
      href: "/dashboard/wallet?tab=activity",
    });
  }
  return { notes, latest };
}

/** Unstaked NEAR that became withdrawable (one notification per pool + amount). */
export function unstakeReadyNotifications(positions: { poolId: string; unstaked: string; unstakedYocto: string; canWithdraw: boolean }[], alreadyNotified: Set<string>) {
  return positions
    .filter((p) => p.canWithdraw && p.unstakedYocto !== "0")
    .map((p) => ({
      id: `unstake:${p.poolId}:${p.unstakedYocto}`,
      kind: "stake" as const,
      title: `${p.unstaked} NEAR ready to withdraw`,
      body: `Your unstaked NEAR at ${p.poolId} can now be withdrawn.`,
      at: new Date().toISOString(),
      href: "/dashboard/wallet?tab=stake",
    }))
    .filter((n) => !alreadyNotified.has(n.id));
}

/** Newest first, de-duplicated by id, capped. */
export function mergeNotifications(existing: AppNotification[], incoming: Omit<AppNotification, "read">[]): AppNotification[] {
  const ids = new Set(existing.map((n) => n.id));
  const added = incoming.filter((n) => !ids.has(n.id)).map((n) => ({ ...n, read: false }));
  return [...added, ...existing].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_NOTIFICATIONS);
}
