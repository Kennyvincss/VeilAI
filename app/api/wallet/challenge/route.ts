import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getRequestContext } from "@/lib/session";
import { signToken } from "@/lib/security/crypto";
import { jsonError, jsonOk } from "@/lib/security/http";
import { CHALLENGE_COOKIE, NEP413_RECIPIENT } from "@/lib/near/challenge";


/**
 * Issues a single-use NEP-413 challenge. The nonce and message are bound in
 * an HMAC-signed, httpOnly cookie that expires in 5 minutes, so a signature
 * can only be redeemed once, by this browser, for this user.
 */
export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx.user) return jsonError(401, "Sign in to verify wallet ownership.");
  const nonce = randomBytes(32);
  const issued = new Date().toISOString();
  const message = `VEIL AI wallet ownership verification.\nSigning this message proves you control this account. It cannot move funds or approve transactions.\nIssued: ${issued}`;
  const token = signToken({ n: nonce.toString("base64"), m: message, u: ctx.user.id }, 300);
  const store = await cookies();
  store.set(CHALLENGE_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 300, path: "/api/wallet" });
  return jsonOk({ message, recipient: NEP413_RECIPIENT, nonce: nonce.toString("base64") });
}
