/**
 * NEAR account ID validation, following the protocol rules:
 * https://nomicon.io/DataStructures/Account#account-id-rules
 *
 * - 2–64 characters
 * - lowercase alphanumerics separated by single `-` or `_`, parts joined by `.`
 * - 64-char lowercase hex strings are implicit (ed25519) accounts
 * - `0x` + 40 hex chars are ETH-implicit accounts (NEP-518)
 */

import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english.js";

const ACCOUNT_ID_REGEX = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const IMPLICIT_REGEX = /^[0-9a-f]{64}$/;
const ETH_IMPLICIT_REGEX = /^0x[0-9a-f]{40}$/;

export type AccountKind = "named" | "implicit" | "eth-implicit";

export function normalizeAccountId(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidAccountId(input: string): boolean {
  if (typeof input !== "string") return false;
  const id = input;
  if (id.length < 2 || id.length > 64) return false;
  if (ETH_IMPLICIT_REGEX.test(id)) return true;
  return ACCOUNT_ID_REGEX.test(id);
}

export function accountKind(id: string): AccountKind {
  if (IMPLICIT_REGEX.test(id)) return "implicit";
  if (ETH_IMPLICIT_REGEX.test(id)) return "eth-implicit";
  return "named";
}

/** Best-effort check that a mainnet/testnet account belongs to the selected network. */
export function matchesNetwork(id: string, network: "mainnet" | "testnet"): boolean {
  const kind = accountKind(id);
  if (kind !== "named") return true;
  if (!id.includes(".")) return true; // top-level accounts exist on both
  const isTestnet = id.endsWith(".testnet");
  return network === "testnet" ? isTestnet : !isTestnet;
}

let bip39Words: Set<string> | null = null;
function bip39(): Set<string> {
  if (!bip39Words) bip39Words = new Set(englishWordlist);
  return bip39Words;
}

/**
 * Detects common seed-phrase / private-key shapes users might paste by
 * mistake, anywhere in the input, so they can be rejected before being sent
 * to any server, model or log.
 */
export function looksLikeSecret(input: string): boolean {
  const t = input.trim();
  // NEAR secret keys: ed25519 secret keys are 64 bytes (~87-88 base58 chars).
  if (/ed25519:[1-9A-HJ-NP-Za-km-z]{80,}/.test(t)) return true;
  if (/secp256k1:[1-9A-HJ-NP-Za-km-z]{40,}/.test(t)) return true;
  // EVM private keys are conventionally 0x-prefixed 32-byte hex.
  if (/(^|\s)0x[0-9a-fA-F]{64}(\s|$)/.test(t)) return true;
  // BIP-39 mnemonics: 12+ consecutive words all from the BIP-39 English list.
  const words = t.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (words.length >= 12) {
    const list = bip39();
    let run = 0;
    for (const w of words) {
      run = list.has(w) ? run + 1 : 0;
      if (run >= 12) return true;
    }
  }
  return false;
}
