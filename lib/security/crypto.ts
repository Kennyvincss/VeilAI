import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { dataEncryptionKey, getEnv } from "@/lib/env";

/**
 * Application-level encryption for sensitive free text stored in Supabase
 * (chat messages, financial goals). AES-256-GCM with a random 96-bit IV.
 *
 * Format: "enc:v1:<base64(iv | tag | ciphertext)>"
 *
 * When DATA_ENCRYPTION_KEY is not configured, values are stored as-is and the
 * Privacy Centre reports that application-level encryption is OFF.
 */

const PREFIX = "enc:v1:";

export function encryptField(plaintext: string): string {
  const key = dataEncryptionKey();
  if (!key) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptField(stored: string | null | undefined): string {
  if (!stored) return "";
  if (!stored.startsWith(PREFIX)) return stored;
  const key = dataEncryptionKey();
  if (!key) return "[encrypted — DATA_ENCRYPTION_KEY not available]";
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return "[unable to decrypt — key mismatch]";
  }
}

let processSecret: Buffer | null = null;
function appSecret(): Buffer {
  const configured = getEnv().APP_SECRET;
  if (configured) return Buffer.from(configured, "utf8");
  if (!processSecret) processSecret = randomBytes(32);
  return processSecret;
}

/**
 * Signed, expiring tokens used for NEP-413 sign-in nonces. The nonce is
 * returned to the browser inside an httpOnly cookie and must match exactly
 * when the signed message is submitted — this prevents replaying an old
 * signature.
 */
export function signToken(payload: Record<string, string | number>, ttlSec: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec })).toString(
    "base64url",
  );
  const mac = createHmac("sha256", appSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyToken<T extends Record<string, unknown>>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", appSecret()).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(mac, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    if (typeof parsed.exp !== "number" || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}
