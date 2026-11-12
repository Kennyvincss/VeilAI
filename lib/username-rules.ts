/** Username and new-account name rules (client-safe; mirrored in the database). */

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "support", "help", "helpdesk", "security", "official", "team", "staff", "moderator", "mod",
  "veil", "veilai", "veil_ai", "near", "nearai", "near_ai", "nearprotocol", "near_protocol", "wallet", "system", "api", "null", "undefined",
  "billing", "payments", "payment", "refund", "refunds", "verify", "verification", "login", "signin", "signup", "account", "accounts",
]);

/**
 * Names VEIL can create as NEAR accounts (name.near / name.testnet):
 * 3–20 chars, lowercase letters and digits, single "_" between parts.
 * Every such name is also a valid VEIL username.
 */
export const NEW_ACCOUNT_NAME_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export function newAccountNameProblem(name: string): string | null {
  if (name.length < 3 || name.length > 20) return "Names are 3–20 characters.";
  if (!NEW_ACCOUNT_NAME_RE.test(name)) return "Use lowercase letters and numbers; an underscore can separate words.";
  if (RESERVED_USERNAMES.has(name)) return "That name is reserved.";
  return null;
}

export function topLevelFor(network: "mainnet" | "testnet") {
  return network === "mainnet" ? "near" : "testnet";
}

/** The message the new key signs to prove the browser holds it. */
export function creationMessage(accountId: string, publicKey: string) {
  return `VEIL AI: create ${accountId} controlled by ${publicKey}`;
}
