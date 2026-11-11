import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Wallet } from "ethers";
import type { VerificationResult } from "@/types";
import { __resetEnvForTests } from "@/lib/env";
import { createProofToken, readProofToken } from "@/lib/near-ai/proof";
import { verifyCompletionSignature } from "@/lib/near-ai/checks";

const signer = Wallet.createRandom();
const text = `${"a".repeat(64)}:${"b".repeat(64)}`;

async function verified(over: Partial<VerificationResult> = {}): Promise<VerificationResult> {
  return {
    state: "verified",
    model: "m",
    nonce: "n",
    startedAt: "2026-11-10T00:00:00.000Z",
    completedAt: "2026-11-10T00:00:01.000Z",
    durationMs: 1000,
    chatId: "chatcmpl-1",
    signature: { text, signature: await signer.signMessage(text), signingAddress: signer.address, algo: "ecdsa" },
    completionChecks: [{ id: "signature_valid", label: "sig", status: "pass", required: true, expected: "secret-ish detail" }],
    targets: [{ kind: "model", signingAddress: signer.address, signingAlgo: "ecdsa", checks: [{ id: "tdx", label: "TDX", status: "pass", required: true, detail: "long" }], verified: true, tdxStatus: "UpToDate", gpuVerdict: "PASS", composeHash: "c" }],
    e2ee: { enabled: true, modelKeyAttested: true },
    summary: "ok",
    errors: [],
    ...over,
  };
}

beforeEach(() => {
  process.env.APP_SECRET = "test-secret-for-proofs";
  __resetEnvForTests();
});
afterEach(() => {
  delete process.env.APP_SECRET;
  __resetEnvForTests();
});

describe("shareable proofs", () => {
  it("round-trips a verified result without answer text or check details", async () => {
    const token = createProofToken(await verified())!;
    expect(token.length).toBeLessThan(3000);
    const p = readProofToken(token)!;
    expect(p.state).toBe("verified");
    expect(p.e2ee).toBe(true);
    expect(JSON.stringify(p)).not.toContain("secret-ish detail");
    // The embedded enclave signature is independently checkable.
    expect(verifyCompletionSignature({ text: p.signature.text, signature: p.signature.signature, signing_address: p.signature.signingAddress }, "ecdsa").valid).toBe(true);
  });
  it("is only issued for VERIFIED results with a signature", async () => {
    expect(createProofToken(await verified({ state: "failed" }))).toBeNull();
    expect(createProofToken(await verified({ signature: undefined }))).toBeNull();
  });
  it("rejects tampered, foreign or oversized tokens", async () => {
    const token = createProofToken(await verified())!;
    const [body, mac] = token.split(".");
    expect(readProofToken(`${body}x.${mac}`)).toBeNull();
    expect(readProofToken(`${body}.${mac.slice(0, -2)}AA`)).toBeNull();
    expect(readProofToken("x".repeat(9000))).toBeNull();
    process.env.APP_SECRET = "another-deployment";
    __resetEnvForTests();
    expect(readProofToken(token)).toBeNull();
  });
  it("is disabled without a stable APP_SECRET", async () => {
    delete process.env.APP_SECRET;
    __resetEnvForTests();
    expect(createProofToken(await verified())).toBeNull();
  });
});
