import { createHash } from "node:crypto";
import { base58, base64 } from "@scure/base";
import { ed25519 } from "@noble/curves/ed25519.js";

/**
 * NEP-413 signed-message verification
 * (https://github.com/near/NEPs/blob/master/neps/nep-0413.md).
 *
 * The wallet signs sha256(borsh(tag) || borsh(payload)) where
 *   tag     = 2^31 + 413 (u32, little-endian)
 *   payload = { message: string, nonce: [u8; 32], recipient: string, callbackUrl: Option<string> }
 *
 * A valid signature proves control of the key. Ownership of the *account*
 * additionally requires that key to be a FullAccess key on that account,
 * which the caller checks via RPC `view_access_key`.
 */

export const NEP413_TAG = 2147484061;

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function borshString(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  return concat(u32(bytes.length), bytes);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function nep413Payload(message: string, nonce: Uint8Array, recipient: string, callbackUrl?: string | null): Uint8Array {
  if (nonce.length !== 32) throw new Error("NEP-413 nonce must be 32 bytes");
  const cb = callbackUrl ? concat(new Uint8Array([1]), borshString(callbackUrl)) : new Uint8Array([0]);
  return concat(u32(NEP413_TAG), borshString(message), nonce, borshString(recipient), cb);
}

export function nep413Hash(message: string, nonce: Uint8Array, recipient: string, callbackUrl?: string | null): Uint8Array {
  return new Uint8Array(createHash("sha256").update(nep413Payload(message, nonce, recipient, callbackUrl)).digest());
}

export function decodeEd25519PublicKey(pk: string): Uint8Array {
  const [type, data] = pk.split(":");
  if (type !== "ed25519" || !data) throw new Error("Only ed25519 keys are supported");
  const bytes = base58.decode(data);
  if (bytes.length !== 32) throw new Error("Invalid ed25519 public key length");
  return bytes;
}

export function decodeSignature(sig: string): Uint8Array {
  const clean = sig.replace(/^ed25519:/, "");
  try {
    const b = base64.decode(clean.padEnd(clean.length + ((4 - (clean.length % 4)) % 4), "="));
    if (b.length === 64) return b;
  } catch {
    /* try base58 */
  }
  const b58 = base58.decode(clean);
  if (b58.length !== 64) throw new Error("Invalid signature length");
  return b58;
}

export function verifyNep413Signature(params: {
  message: string;
  nonce: Uint8Array;
  recipient: string;
  callbackUrl?: string | null;
  publicKey: string;
  signature: string;
}): boolean {
  try {
    const hash = nep413Hash(params.message, params.nonce, params.recipient, params.callbackUrl);
    return ed25519.verify(decodeSignature(params.signature), hash, decodeEd25519PublicKey(params.publicKey));
  } catch {
    return false;
  }
}
