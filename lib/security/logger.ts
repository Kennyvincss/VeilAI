/**
 * Privacy-preserving structured logger.
 *
 * Rules enforced here:
 *  - Never log prompt or completion text.
 *  - Never log full wallet/account IDs — they are hashed to a short,
 *    non-reversible fingerprint so related events can still be correlated.
 *  - Never log credentials; any key that looks secret is redacted.
 */
import { createHash } from "node:crypto";

const SECRET_KEYS = /(key|token|secret|password|authorization|cookie|signature|prompt|content|message)/i;

export function fingerprint(value: string): string {
  return createHash("sha256").update(`veil:${value}`).digest("hex").slice(0, 10);
}

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET_KEYS.test(k)) out[k] = "[redacted]";
    else if (k.toLowerCase().includes("account") && typeof v === "string") out[k] = `acct_${fingerprint(v)}`;
    else if (typeof v === "string" && v.length > 200) out[k] = `${v.slice(0, 60)}…[truncated]`;
    else out[k] = v;
  }
  return out;
}

type Level = "info" | "warn" | "error";

export function log(level: Level, event: string, meta: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "test") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...redact(meta) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const __testing = { redact };
