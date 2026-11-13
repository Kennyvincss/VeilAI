/**
 * Detects wallet actions ("send 5 NEAR to bob.near", "stake 10 NEAR with
 * the lowest-fee validator", "swap 2 NEAR to USDC") in the USER's own
 * message.
 *
 * Security: actions are derived only from what the user typed, never from
 * model output, so a prompt-injected answer cannot propose a transfer. A
 * detected action only offers a card; the transaction is then prepared and
 * checked by the same server code as the Wallet page, reviewed in-app, and
 * approved in the user's wallet.
 */

export type ChatAction =
  | { kind: "send"; amount: string; token: string; to: string }
  | { kind: "stake"; amount: string; pool: string | null; lowestFee: boolean }
  | { kind: "unstake"; amount: string; pool: string | null }
  | { kind: "swap"; amount: string; from: string; to: string };

const AMOUNT = String.raw`(\d{1,15}(?:[.,]\d{1,24})?|\.\d{1,24})`;
const TOKEN = String.raw`(\$?[a-z][a-z0-9.]{0,15})`;
const ACCOUNT = String.raw`([a-z0-9][a-z0-9_-]*(?:\.[a-z0-9_-]+)*\.(?:near|testnet|tg)|[0-9a-f]{64})`;
const POOL = String.raw`([a-z0-9][a-z0-9_-]*(?:\.[a-z0-9_-]+)*\.(?:poolv1\.near|pool\.near|pool\.f863973\.m0))`;

const normAmount = (a: string) => (a.startsWith(".") ? `0${a}` : a).replace(",", ".");
const normToken = (t: string) => t.replace(/^\$/, "").toUpperCase();
/** Words that are never a token symbol in these sentences. */
const NOT_TOKENS = new Set(["TO", "FOR", "INTO", "WITH", "ON", "IN", "FROM", "OF", "THE", "MY", "A", "AN"]);

export function parseAction(message: string): ChatAction | null {
  const text = message.toLowerCase().replace(/\s+/g, " ").trim();
  if (text.length > 400) return null;

  // send / transfer / pay  <amount> <token> to <account>
  let m = new RegExp(String.raw`\b(?:send|transfer|pay)\s+${AMOUNT}\s*${TOKEN}\s+to\s+${ACCOUNT}\b`).exec(text);
  if (m && !NOT_TOKENS.has(normToken(m[2]))) return { kind: "send", amount: normAmount(m[1]), token: normToken(m[2]), to: m[3] };
  // pay <account> <amount> <token>
  m = new RegExp(String.raw`\bpay\s+${ACCOUNT}\s+${AMOUNT}\s*${TOKEN}\b`).exec(text);
  if (m && !NOT_TOKENS.has(normToken(m[3]))) return { kind: "send", amount: normAmount(m[2]), token: normToken(m[3]), to: m[1] };

  // unstake <amount> near [from <pool>]   (checked before "stake")
  m = new RegExp(String.raw`\bunstake\s+${AMOUNT}\s*(?:near\b)?(?:.*?\bfrom\s+${POOL})?`).exec(text);
  if (m) return { kind: "unstake", amount: normAmount(m[1]), pool: m[2] ?? null };

  // stake <amount> near [with|on|to|in|at <pool> | lowest fee]
  m = new RegExp(String.raw`\bstake\s+${AMOUNT}\s*(?:near\b)?(?:.*?\b(?:with|on|to|in|at|via)\s+${POOL})?`).exec(text);
  if (m) {
    const lowestFee = /\b(lowest|cheapest|smallest|low)[- ]?(?:fee|commission)|\bfee\b.*\blowest\b/.test(text);
    return { kind: "stake", amount: normAmount(m[1]), pool: m[2] ?? null, lowestFee: !m[2] && lowestFee };
  }

  // swap / convert / exchange / trade <amount> <token> to|for|into <token>
  m = new RegExp(String.raw`\b(?:swap|convert|exchange|trade)\s+${AMOUNT}\s*${TOKEN}\s+(?:to|for|into)\s+${TOKEN}\b`).exec(text);
  if (m && !NOT_TOKENS.has(normToken(m[2])) && !NOT_TOKENS.has(normToken(m[3])) && normToken(m[2]) !== normToken(m[3])) {
    return { kind: "swap", amount: normAmount(m[1]), from: normToken(m[2]), to: normToken(m[3]) };
  }
  return null;
}

/** One-line description, also given to the model so it doesn't claim the action happened. */
export function describeAction(a: ChatAction): string {
  switch (a.kind) {
    case "send":
      return `send ${a.amount} ${a.token} to ${a.to}`;
    case "stake":
      return `stake ${a.amount} NEAR${a.pool ? ` with ${a.pool}` : a.lowestFee ? " with the lowest-fee validator" : ""}`;
    case "unstake":
      return `unstake ${a.amount} NEAR${a.pool ? ` from ${a.pool}` : ""}`;
    case "swap":
      return `swap ${a.amount} ${a.from} to ${a.to}`;
  }
}
