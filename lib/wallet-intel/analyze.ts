import type { NormalizedFtTransfer, NormalizedTx, RiskIndicator, WalletIntelReport } from "@/types";
import { KNOWN_CONTRACTS, lookupRiskList } from "@/lib/wallet-intel/known";

/**
 * Pure wallet analysis. Inputs are normalised on-chain records; outputs are
 * FACTS (counts, sums, dates) and HEURISTIC indicators. Indicators always
 * cite the evidence that triggered them and are never presented as a
 * judgement that a wallet is malicious.
 */

export const LARGE_TRANSFER_NEAR = 1_000;
export const LARGE_TRANSFER_USD_STABLE = 10_000;

const DAY = 86_400_000;

export function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export function buildTimeline(txs: NormalizedTx[]) {
  const map = new Map<string, { count: number; nearVolume: number }>();
  for (const t of txs) {
    const k = dayKey(t.timestamp);
    const e = map.get(k) ?? { count: 0, nearVolume: 0 };
    e.count += 1;
    e.nearVolume += t.depositNear;
    map.set(k, e);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, count: v.count, nearVolume: round(v.nearVolume, 4) }));
}

export function computeStats(subject: string, txs: NormalizedTx[], fts: NormalizedFtTransfer[], totalIndexed: number | null) {
  const times = txs.map((t) => new Date(t.timestamp).getTime()).filter((n) => n > 0);
  const first = times.length ? Math.min(...times) : null;
  const last = times.length ? Math.max(...times) : null;
  const windowDays = first !== null && last !== null ? Math.max(1, (last - first) / DAY) : null;
  const counterparties = new Set<string>();
  for (const t of txs) {
    const cp = t.direction === "out" ? t.receiver : t.signer;
    if (cp && cp !== subject) counterparties.add(cp);
  }
  for (const f of fts) if (f.counterparty && f.counterparty !== subject) counterparties.add(f.counterparty);
  return {
    sampledTransactions: txs.length,
    sampledFtTransfers: fts.length,
    totalTransactionsIndexed: totalIndexed,
    failedTransactions: txs.filter((t) => t.success === false).length,
    txPerDay: windowDays !== null && txs.length > 1 ? round(txs.length / windowDays, 2) : null,
    activeDays: new Set(txs.map((t) => dayKey(t.timestamp))).size,
    nearIn: round(txs.filter((t) => t.direction === "in").reduce((s, t) => s + t.depositNear, 0), 4),
    nearOut: round(txs.filter((t) => t.direction === "out").reduce((s, t) => s + t.depositNear, 0), 4),
    uniqueCounterparties: counterparties.size,
    sampleWindowDays: windowDays !== null ? round(windowDays, 1) : null,
  };
}

export function topCounterparties(subject: string, txs: NormalizedTx[], fts: NormalizedFtTransfer[], limit = 8) {
  const counts = new Map<string, number>();
  for (const t of txs) {
    const cp = t.direction === "out" ? t.receiver : t.signer;
    if (cp && cp !== subject) counts.set(cp, (counts.get(cp) ?? 0) + 1);
  }
  for (const f of fts) if (f.counterparty && f.counterparty !== subject) counts.set(f.counterparty, (counts.get(f.counterparty) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([account, interactions]) => ({ account, interactions, isContract: KNOWN_CONTRACTS[account] ? true : null }));
}

export function contractInteractions(subject: string, txs: NormalizedTx[], limit = 10) {
  const map = new Map<string, { methods: Set<string>; calls: number }>();
  for (const t of txs) {
    if (t.signer !== subject) continue;
    for (const a of t.actions) {
      if (a.kind !== "FUNCTION_CALL") continue;
      const e = map.get(t.receiver) ?? { methods: new Set<string>(), calls: 0 };
      if (a.method) e.methods.add(a.method);
      e.calls += 1;
      map.set(t.receiver, e);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1].calls - a[1].calls)
    .slice(0, limit)
    .map(([contract, v]) => ({ contract, methods: [...v.methods].slice(0, 8), calls: v.calls }));
}

export function largeTransfers(subject: string, txs: NormalizedTx[], fts: NormalizedFtTransfer[]) {
  const out: WalletIntelReport["largeTransfers"] = [];
  for (const t of txs) {
    if (t.depositNear >= LARGE_TRANSFER_NEAR && (t.direction === "in" || t.direction === "out")) {
      out.push({
        hash: t.hash,
        timestamp: t.timestamp,
        direction: t.direction,
        amount: round(t.depositNear, 4),
        asset: "NEAR",
        counterparty: t.direction === "out" ? t.receiver : t.signer,
      });
    }
  }
  for (const f of fts) {
    const stable = /^USD/i.test(f.symbol);
    if (stable && Math.abs(f.delta) >= LARGE_TRANSFER_USD_STABLE) {
      out.push({
        hash: f.hash,
        timestamp: f.timestamp,
        direction: f.delta < 0 ? "out" : "in",
        amount: round(Math.abs(f.delta), 2),
        asset: f.symbol,
        counterparty: f.counterparty ?? "unknown",
      });
    }
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 15);
}

/**
 * Heuristic indicators. Each one is deliberately conservative and
 * documented in docs/SECURITY.md#wallet-heuristics.
 */
export function riskIndicators(
  subject: string,
  txs: NormalizedTx[],
  fts: NormalizedFtTransfer[],
  stats: ReturnType<typeof computeStats>,
  nativeNear: number | null,
): RiskIndicator[] {
  const out: RiskIndicator[] = [];

  // 1. Interactions with addresses on a configured, sourced risk list.
  const flagged = new Map<string, { source: string; reason: string }>();
  for (const t of txs) {
    for (const cp of [t.signer, t.receiver]) {
      const hit = cp !== subject ? lookupRiskList(cp) : null;
      if (hit) flagged.set(cp, hit);
    }
  }
  if (flagged.size > 0) {
    out.push({
      id: "risk-list-interaction",
      severity: "high",
      title: "Interaction with an address on a published risk list",
      evidence: [...flagged.entries()].map(([a, h]) => `${a} — ${h.reason} (source: ${h.source})`),
      heuristic: true,
    });
  }

  // 2. Failed transaction ratio.
  if (stats.sampledTransactions >= 10) {
    const ratio = stats.failedTransactions / stats.sampledTransactions;
    if (ratio >= 0.2) {
      out.push({
        id: "failed-ratio",
        severity: ratio >= 0.4 ? "medium" : "low",
        title: "High share of failed transactions",
        evidence: [`${stats.failedTransactions} of ${stats.sampledTransactions} sampled transactions failed (${Math.round(ratio * 100)}%).`],
        heuristic: true,
      });
    }
  }

  // 3. Activity burst: busiest day far above the sample's median day.
  const timeline = buildTimeline(txs);
  if (timeline.length >= 5) {
    const counts = timeline.map((d) => d.count).sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)];
    const peak = timeline.reduce((m, d) => (d.count > m.count ? d : m), timeline[0]);
    if (peak.count >= 10 && peak.count >= median * 5) {
      out.push({
        id: "activity-burst",
        severity: "low",
        title: "Unusual burst of activity",
        evidence: [`${peak.count} transactions on ${peak.date} vs a median of ${median} per active day in the sample.`],
        heuristic: true,
      });
    }
  }

  // 4. Large outflow relative to remaining balance.
  const outflows = txs.filter((t) => t.direction === "out" && t.depositNear > 0);
  const biggestOut = outflows.reduce((m, t) => (t.depositNear > m ? t.depositNear : m), 0);
  if (nativeNear !== null && biggestOut >= 100 && biggestOut > nativeNear * 5) {
    out.push({
      id: "drain-pattern",
      severity: "medium",
      title: "Large outflow relative to remaining balance",
      evidence: [`Largest sampled outgoing NEAR transfer: ${round(biggestOut, 2)} NEAR; current balance: ${round(nativeNear, 2)} NEAR.`],
      heuristic: true,
    });
  }

  // 5. Many unpriced/unknown tokens received (typical of spam airdrops).
  const inboundTokens = new Set(fts.filter((f) => f.delta > 0 && f.cause === "MINT").map((f) => f.contractId));
  if (inboundTokens.size >= 5) {
    out.push({
      id: "airdrop-spam",
      severity: "info",
      title: "Received many minted tokens",
      evidence: [`${inboundTokens.size} distinct token contracts minted to this account in the sample. Unsolicited tokens can be phishing lures — do not interact with unknown token contracts.`],
      heuristic: true,
    });
  }

  // 6. Full-access key additions in the sample (security-relevant changes).
  const keyAdds = txs.filter((t) => t.signer === subject && t.actions.some((a) => a.kind === "ADD_KEY"));
  if (keyAdds.length > 0) {
    out.push({
      id: "key-changes",
      severity: "info",
      title: "Access keys were added recently",
      evidence: keyAdds.slice(0, 3).map((t) => `ADD_KEY in ${t.hash.slice(0, 10)}… on ${dayKey(t.timestamp)}`),
      heuristic: true,
    });
  }

  if (out.length === 0) {
    out.push({
      id: "none",
      severity: "info",
      title: "No risk indicators triggered in the sampled activity",
      evidence: [
        `Checked ${stats.sampledTransactions} transactions and ${stats.sampledFtTransfers} token transfers.`,
        "Absence of indicators is not proof of safety.",
      ],
      heuristic: true,
    });
  }
  return out;
}

function round(v: number, d: number) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
