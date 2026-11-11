import type { NormalizedFtTransfer, NormalizedTx } from "@/types";

/**
 * Turns an account's recent on-chain records into plain-language activity
 * lines for the Wallet page. Pure; facts only.
 */

export interface ActivityItem {
  hash: string;
  timestamp: string;
  kind: "sent" | "received" | "stake" | "unstake" | "withdraw" | "token-in" | "token-out" | "call" | "other";
  title: string;
  counterparty: string | null;
  amount: string | null;
  success: boolean | null;
}

const fmt = (n: number, max = 4) => n.toLocaleString("en", { maximumFractionDigits: max });

export function describeTx(subject: string, t: NormalizedTx): ActivityItem {
  const base = { hash: t.hash, timestamp: t.timestamp, success: t.success };
  const call = t.actions.find((a) => a.kind === "FUNCTION_CALL");
  const method = call?.method ?? null;
  const outgoing = t.signer === subject;
  if (method === "deposit_and_stake") return { ...base, kind: "stake", title: `Staked with ${t.receiver}`, counterparty: t.receiver, amount: `${fmt(t.depositNear)} NEAR` };
  if (method === "unstake" || method === "unstake_all") return { ...base, kind: "unstake", title: `Unstaked from ${t.receiver}`, counterparty: t.receiver, amount: null };
  if (method === "withdraw_all" || method === "withdraw") return { ...base, kind: "withdraw", title: `Withdrew from ${t.receiver}`, counterparty: t.receiver, amount: null };
  // Token movements are listed from the token-transfer feed, which carries amounts.
  if (method === "ft_transfer" || method === "ft_transfer_call" || method === "storage_deposit") {
    return { ...base, kind: "call", title: method === "storage_deposit" ? `Registered an account with ${t.receiver}` : `Token transfer via ${t.receiver}`, counterparty: t.receiver, amount: null };
  }
  if (method) return { ...base, kind: "call", title: `${outgoing ? "Called" : "Received call"} ${method} on ${t.receiver}`, counterparty: outgoing ? t.receiver : t.signer, amount: t.depositNear > 0 ? `${fmt(t.depositNear)} NEAR` : null };
  if (t.depositNear > 0) {
    return t.direction === "in"
      ? { ...base, kind: "received", title: `Received from ${t.signer}`, counterparty: t.signer, amount: `+${fmt(t.depositNear)} NEAR` }
      : { ...base, kind: "sent", title: `Sent to ${t.receiver}`, counterparty: t.receiver, amount: `−${fmt(t.depositNear)} NEAR` };
  }
  return { ...base, kind: "other", title: `${t.actions.map((a) => a.kind.toLowerCase().replace(/_/g, " ")).join(", ") || "Transaction"} · ${outgoing ? t.receiver : t.signer}`, counterparty: outgoing ? t.receiver : t.signer, amount: null };
}

export function describeFt(f: NormalizedFtTransfer): ActivityItem {
  const incoming = f.delta > 0;
  return {
    hash: f.hash,
    timestamp: f.timestamp,
    kind: incoming ? "token-in" : "token-out",
    title: incoming ? `Received ${f.symbol}${f.counterparty ? ` from ${f.counterparty}` : ""}` : `Sent ${f.symbol}${f.counterparty ? ` to ${f.counterparty}` : ""}`,
    counterparty: f.counterparty,
    amount: `${incoming ? "+" : "−"}${fmt(Math.abs(f.delta), 6)} ${f.symbol}`,
    success: true,
  };
}

/** Merge both feeds newest-first; token rows replace the generic "token transfer via" row of the same transaction. */
export function buildActivity(subject: string, txs: NormalizedTx[], fts: NormalizedFtTransfer[], limit = 30): ActivityItem[] {
  const ftHashes = new Set(fts.map((f) => f.hash));
  const items = [...txs.map((t) => describeTx(subject, t)).filter((i) => !(i.kind === "call" && ftHashes.has(i.hash) && i.title.startsWith("Token transfer"))), ...fts.map(describeFt)];
  return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}
