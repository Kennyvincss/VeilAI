import type { NormalizedFtTransfer, NormalizedTx } from "@/types";
import { computeStats, riskIndicators } from "@/lib/wallet-intel/analyze";
import { KNOWN_CONTRACTS, lookupRiskList } from "@/lib/wallet-intel/known";

/**
 * Pre-send safety check on the receiving account.
 *
 * Pure analysis over public on-chain facts gathered by the caller. Every
 * finding cites what triggered it. Findings are heuristics, never verdicts:
 * "danger" means the user must explicitly acknowledge it before approving,
 * not that VEIL AI blocks the transfer.
 */

export type SafetySeverity = "info" | "caution" | "danger";

export interface SafetyFinding {
  id: string;
  severity: SafetySeverity;
  title: string;
  detail: string;
}

export interface SafetyCheck {
  /** Worst severity found; "unknown" when history could not be read. */
  level: "ok" | "caution" | "danger" | "unknown";
  findings: SafetyFinding[];
}

export interface RecipientFacts {
  from: string;
  to: string;
  /** Token contract when sending a fungible token, else null (native NEAR). */
  tokenContract: string | null;
  receiverIsContract: boolean;
  receiverBalanceNear: number | null;
  /** Receiver history (newest first), or null if unavailable. */
  receiverTxs: NormalizedTx[] | null;
  receiverFts: NormalizedFtTransfer[] | null;
  /** Page size used for receiverTxs, to tell whether the sample is complete. */
  sampleSize: number;
  /** Sender history (newest first), or null if unavailable. */
  senderTxs: NormalizedTx[] | null;
  /** Token contracts known to the app (e.g. NEAR Intents list). */
  knownTokenContracts: string[];
  /** Account IDs from the user's address book (lookalike candidates). */
  contacts?: string[];
  now?: number;
}

const DAY = 86_400_000;

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Returns the account `to` imitates, if any: a near-identical named account
 * (edit distance ≤ 2) or, for 64-hex implicit accounts, the "address
 * poisoning" pattern (same first and last 6 characters, different middle).
 */
export function lookalikeOf(to: string, candidates: Iterable<string>): string | null {
  for (const c of candidates) {
    if (!c || c === to) continue;
    if (HEX64.test(to) && HEX64.test(c)) {
      if (to.slice(0, 6) === c.slice(0, 6) && to.slice(-6) === c.slice(-6)) return c;
      continue;
    }
    if (to.length >= 6 && c.length >= 6 && levenshtein(to, c) <= 2) return c;
  }
  return null;
}

export function analyzeRecipient(f: RecipientFacts): SafetyCheck {
  const findings: SafetyFinding[] = [];
  const now = f.now ?? Date.now();
  const knownTokens = new Set(f.knownTokenContracts);

  // 1. Published risk list.
  const listed = lookupRiskList(f.to);
  if (listed) {
    findings.push({ id: "risk-list", severity: "danger", title: "Receiver is on a published risk list", detail: `${listed.reason} (source: ${listed.source})` });
  }

  // 2. Sending a token to its own contract, or to another token contract.
  if (f.tokenContract && f.to === f.tokenContract) {
    findings.push({ id: "token-to-own-contract", severity: "danger", title: "You are sending this token to its own contract", detail: "Tokens sent to the token contract itself are usually lost forever. Send to a person's or exchange's account instead." });
  } else if (knownTokens.has(f.to)) {
    findings.push({ id: "to-token-contract", severity: "danger", title: "Receiver is a token contract", detail: `${f.to} is a token contract, not a wallet. Funds sent directly to it are usually unrecoverable.` });
  } else if (f.receiverIsContract) {
    const label = KNOWN_CONTRACTS[f.to];
    findings.push({
      id: "contract",
      severity: "caution",
      title: label ? `Receiver is a protocol contract (${label})` : "Receiver is a smart contract",
      detail: "Funds sent directly to a contract may not be recoverable unless it is designed to receive them. If you meant to use this app, use its own interface.",
    });
  }

  // 3. Lookalike of an account the user has sent to before, or a known contract.
  const pastRecipients = new Set((f.senderTxs ?? []).filter((t) => t.signer === f.from).map((t) => t.receiver));
  const contacts = new Set(f.contacts ?? []);
  const saved = contacts.has(f.to);
  const sentBefore = pastRecipients.has(f.to);
  if (saved) findings.push({ id: "saved-contact", severity: "info", title: "In your address book", detail: "This exact account is one of your saved contacts." });
  if (!sentBefore && !saved) {
    const imitated = lookalikeOf(f.to, [...contacts, ...pastRecipients, ...Object.keys(KNOWN_CONTRACTS)]);
    if (imitated) {
      findings.push({
        id: "lookalike",
        severity: "danger",
        title: "Looks like a different account",
        detail: `${f.to} closely resembles ${imitated}${contacts.has(imitated) ? " (a saved contact)" : ""}. Scammers create look-alike accounts to intercept payments — compare every character.`,
      });
    }
  }

  // 4. Previous interactions.
  if (f.senderTxs) {
    findings.push(
      sentBefore
        ? { id: "sent-before", severity: "info", title: "You've sent to this account before", detail: "It appears in your recent transaction history." }
        : { id: "first-time", severity: "info", title: "First time sending to this account", detail: "It does not appear in your recent transaction history. Confirm the address with the recipient through a second channel." },
    );
  }

  // 5. Account age and history.
  if (f.receiverTxs) {
    if (f.receiverTxs.length === 0) {
      findings.push({ id: "no-history", severity: "caution", title: "No transaction history", detail: "This account has never sent or received a transaction. Make sure it's the right one." });
    } else if (f.receiverTxs.length < f.sampleSize) {
      const first = Math.min(...f.receiverTxs.map((t) => new Date(t.timestamp).getTime()).filter((n) => n > 0));
      const ageDays = Math.floor((now - first) / DAY);
      if (Number.isFinite(ageDays) && ageDays < 7) {
        findings.push({ id: "new-account", severity: "caution", title: "Very new account", detail: `First activity ${ageDays === 0 ? "today" : `${ageDays} day${ageDays === 1 ? "" : "s"} ago`}. New accounts are common in scams; be sure you know who controls it.` });
      }
    }

    // 6. Wallet-intelligence heuristics over the receiver's sampled activity.
    const fts = f.receiverFts ?? [];
    const stats = computeStats(f.to, f.receiverTxs, fts, null);
    for (const ind of riskIndicators(f.to, f.receiverTxs, fts, stats, f.receiverBalanceNear)) {
      if (ind.id === "none" || ind.id === "key-changes") continue;
      const severity: SafetySeverity = ind.severity === "high" ? "danger" : ind.severity === "medium" || ind.id === "airdrop-spam" ? "caution" : "info";
      findings.push({ id: `intel-${ind.id}`, severity, title: ind.title, detail: ind.evidence.join(" ") });
    }
  }

  const unknown = f.receiverTxs === null;
  if (unknown) findings.push({ id: "history-unavailable", severity: "info", title: "History check unavailable", detail: "The receiver's on-chain history could not be read right now, so only basic checks ran." });

  const level: SafetyCheck["level"] = findings.some((x) => x.severity === "danger")
    ? "danger"
    : findings.some((x) => x.severity === "caution")
      ? "caution"
      : unknown
        ? "unknown"
        : "ok";
  const order: Record<SafetySeverity, number> = { danger: 0, caution: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { level, findings };
}
