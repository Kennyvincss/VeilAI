import { describe, expect, it } from "vitest";
import type { ActivityItem } from "@/lib/defi/history";
import { incomingNotifications, mergeNotifications, unstakeReadyNotifications, MAX_NOTIFICATIONS } from "@/lib/notifications";
import { normalizeUsername, usernameProblem } from "@/lib/usernames";

const item = (over: Partial<ActivityItem>): ActivityItem => ({
  hash: "h1",
  timestamp: "2026-11-12T10:00:00.000Z",
  kind: "received",
  title: "Received from bob.near",
  counterparty: "bob.near",
  amount: "+2 NEAR",
  success: true,
  ...over,
});

describe("notifications", () => {
  it("notifies only new, successful incoming transfers and advances the high-water mark", () => {
    const items = [
      item({ hash: "new", timestamp: "2026-11-12T10:05:00.000Z" }),
      item({ hash: "tok", kind: "token-in", amount: "+5 USDC", timestamp: "2026-11-12T10:04:00.000Z" }),
      item({ hash: "out", kind: "sent", amount: "−1 NEAR", timestamp: "2026-11-12T10:03:00.000Z" }),
      item({ hash: "fail", success: false, timestamp: "2026-11-12T10:02:00.000Z" }),
      item({ hash: "old", timestamp: "2026-11-12T09:00:00.000Z" }),
    ];
    const { notes, latest } = incomingNotifications("me.near", items, "2026-11-12T10:00:00.000Z", new Set());
    expect(notes.map((n) => n.title)).toEqual(["Received 2 NEAR", "Received 5 USDC"]);
    expect(notes[0].body).toBe("From bob.near to me.near");
    expect(latest).toBe("2026-11-12T10:05:00.000Z");
    // Already-notified items are not repeated.
    expect(incomingNotifications("me.near", items, "2026-11-12T10:00:00.000Z", new Set(notes.map((n) => n.id))).notes).toHaveLength(0);
  });
  it("notifies withdrawable unstaked NEAR once per pool and amount", () => {
    const pos = [
      { poolId: "a.poolv1.near", unstaked: "3", unstakedYocto: "3", canWithdraw: true },
      { poolId: "b.poolv1.near", unstaked: "1", unstakedYocto: "1", canWithdraw: false },
    ];
    const first = unstakeReadyNotifications(pos, new Set());
    expect(first.map((n) => n.title)).toEqual(["3 NEAR ready to withdraw"]);
    expect(unstakeReadyNotifications(pos, new Set(first.map((n) => n.id)))).toHaveLength(0);
  });
  it("merges newest-first without duplicates and caps the list", () => {
    const base = Array.from({ length: MAX_NOTIFICATIONS }, (_, i) => ({ id: `x${i}`, kind: "info" as const, title: "t", body: "b", at: `2026-11-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`, read: true }));
    const merged = mergeNotifications(base, [{ id: "new", kind: "received", title: "n", body: "b", at: "2026-11-12T00:00:00.000Z" }, { id: "x1", kind: "info", title: "dup", body: "b", at: "2026-11-12T00:00:00.000Z" }]);
    expect(merged).toHaveLength(MAX_NOTIFICATIONS);
    expect(merged[0]).toMatchObject({ id: "new", read: false });
    expect(merged.filter((n) => n.id === "x1")).toHaveLength(1);
  });
});

describe("usernames", () => {
  it("normalises and validates", () => {
    expect(normalizeUsername(" @Alice_9 ")).toBe("alice_9");
    expect(usernameProblem("alice_9")).toBeNull();
    expect(usernameProblem("ab")).toMatch(/3–20/);
    expect(usernameProblem("al ice")).toMatch(/3–20/);
    expect(usernameProblem("alice.near")).toMatch(/3–20/);
    expect(usernameProblem("@Support")).toMatch(/reserved/);
  });
});
