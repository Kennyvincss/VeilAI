import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { VerificationResult } from "@/types";
import { getEnv } from "@/lib/env";

/**
 * Shareable verification proofs.
 *
 * A proof is created ONLY by the server, from a verification result it just
 * produced itself (never from data a browser sends). It contains no question
 * or answer text — only the model, timing, the enclave's signature over the
 * request/response hashes, and the attestation check outcomes.
 *
 * Format: base64url(deflate(JSON)) + "." + base64url(HMAC-SHA256). The HMAC
 * proves VEIL AI issued it; the enclave signature inside can additionally be
 * checked by anyone, independently of VEIL AI.
 */

export interface Proof {
  v: 1;
  issuedAt: string;
  model: string;
  state: VerificationResult["state"];
  verifiedAt: string;
  chatId: string | null;
  e2ee: boolean;
  signature: NonNullable<VerificationResult["signature"]>;
  completionChecks: { id: string; label: string; status: string }[];
  enclave: {
    signingAddress: string | null;
    tdxStatus: string | null;
    gpuVerdict: string | null;
    composeHash: string | null;
    checks: { id: string; label: string; status: string; required: boolean }[];
  } | null;
}

const DOMAIN = "veil-proof:v1.";

function secret(): Buffer | null {
  const s = getEnv().APP_SECRET;
  return s ? Buffer.from(s, "utf8") : null;
}

/** True when proofs can be issued (they need a stable APP_SECRET to stay valid). */
export function proofsEnabled(): boolean {
  return secret() !== null;
}

function mac(body: string, key: Buffer): Buffer {
  return createHmac("sha256", key).update(DOMAIN + body).digest();
}

export function proofFromResult(r: VerificationResult): Proof | null {
  if (r.state !== "verified" || !r.signature) return null;
  const t = r.targets[0];
  return {
    v: 1,
    issuedAt: new Date().toISOString(),
    model: r.model,
    state: r.state,
    verifiedAt: r.completedAt,
    chatId: r.chatId ?? null,
    e2ee: r.e2ee.enabled && r.e2ee.modelKeyAttested === true,
    signature: r.signature,
    completionChecks: r.completionChecks.map((c) => ({ id: c.id, label: c.label, status: c.status })),
    enclave: t
      ? {
          signingAddress: t.signingAddress,
          tdxStatus: t.tdxStatus ?? null,
          gpuVerdict: t.gpuVerdict ?? null,
          composeHash: t.composeHash ?? null,
          checks: t.checks.map((c) => ({ id: c.id, label: c.label, status: c.status, required: c.required })),
        }
      : null,
  };
}

/** Issue a proof token for a VERIFIED result; null otherwise or when no APP_SECRET is set. */
export function createProofToken(r: VerificationResult): string | null {
  const key = secret();
  const proof = proofFromResult(r);
  if (!key || !proof) return null;
  const body = deflateRawSync(Buffer.from(JSON.stringify(proof), "utf8")).toString("base64url");
  return `${body}.${mac(body, key).toString("base64url")}`;
}

export const MAX_PROOF_TOKEN = 8000;

/** Returns the proof if the token was issued by this deployment, else null. */
export function readProofToken(token: string | null | undefined): Proof | null {
  const key = secret();
  if (!key || !token || token.length > MAX_PROOF_TOKEN) return null;
  const [body, given] = token.split(".");
  if (!body || !given || !/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(given)) return null;
  const expected = mac(body, key);
  const g = Buffer.from(given, "base64url");
  if (g.length !== expected.length || !timingSafeEqual(g, expected)) return null;
  try {
    const p = JSON.parse(inflateRawSync(Buffer.from(body, "base64url"), { maxOutputLength: 64 * 1024 }).toString("utf8")) as Proof;
    return p && p.v === 1 && p.signature ? p : null;
  } catch {
    return null;
  }
}
