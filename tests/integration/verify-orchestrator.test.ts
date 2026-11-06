import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Wallet } from "ethers";
import type { VerificationCheck } from "@/types";

/**
 * Integration tests for the verification orchestrator with the network
 * boundaries (NEAR AI client, Intel DCAP, NVIDIA NRAS) mocked. The key
 * property: the result is VERIFIED only when every required check passes.
 */

const reportData = { current: "" };
const tdx = { verified: true, status: "UpToDate" as string | null };
const gpu = { pass: true };

vi.mock("@/lib/near-ai/hardware", () => ({
  verifyTdxQuote: vi.fn(async () => ({
    verified: tdx.verified,
    status: tdx.status,
    reportDataHex: tdx.verified ? reportData.current : null,
    mrConfigHex: "01" + (globalThis as unknown as { __composeHash: string }).__composeHash,
    check: { id: "tdx_quote", label: "TDX", status: tdx.verified ? "pass" : "fail", required: true } satisfies VerificationCheck,
  })),
  verifyGpu: vi.fn(async (_p: string | undefined, nonce: string) => ({
    verdict: gpu.pass ? "true" : "false",
    checks: [
      { id: "gpu_nonce", label: "nonce", status: "pass", required: true, actual: nonce },
      { id: "gpu_verdict", label: "verdict", status: gpu.pass ? "pass" : "fail", required: true },
    ] satisfies VerificationCheck[],
  })),
}));

const client = {
  fetchAttestationReport: vi.fn(),
  fetchSignature: vi.fn(),
};
vi.mock("@/lib/near-ai/client", async (orig) => {
  const actual = await orig<typeof import("@/lib/near-ai/client")>();
  return { ...actual, fetchAttestationReport: (...a: unknown[]) => client.fetchAttestationReport(...a), fetchSignature: (...a: unknown[]) => client.fetchSignature(...a) };
});

import { sha256Hex, signingAddressPadded32 } from "@/lib/near-ai/checks";
import { verifyCompletion, verifyModelAttestation } from "@/lib/near-ai/verify";
import { __resetEnvForTests } from "@/lib/env";

const appCompose = JSON.stringify({ docker_compose_file: "image: x@sha256:" + "c".repeat(64) });
(globalThis as unknown as { __composeHash: string }).__composeHash = sha256Hex(appCompose);

function attestation(address: string) {
  return { signing_address: address, signing_algo: "ecdsa", intel_quote: "00", nvidia_payload: "{}", info: { tcb_info: JSON.stringify({ app_compose: appCompose }) } };
}
function bindReport(address: string) {
  client.fetchAttestationReport.mockImplementation(async ({ nonce }: { nonce: string }) => {
    reportData.current = Buffer.concat([signingAddressPadded32(address, "ecdsa"), Buffer.from(nonce, "hex")]).toString("hex");
    return { gateway_attestation: attestation(address), model_attestations: [attestation(address)] };
  });
}

beforeEach(() => {
  process.env.NEAR_AI_API_KEY = "sk-test";
  __resetEnvForTests();
  tdx.verified = true;
  tdx.status = "UpToDate";
  gpu.pass = true;
  client.fetchAttestationReport.mockReset();
  client.fetchSignature.mockReset();
});
afterEach(() => {
  delete process.env.NEAR_AI_API_KEY;
  __resetEnvForTests();
});

describe("verifyModelAttestation", () => {
  const addr = Wallet.createRandom().address;

  it("is VERIFIED when every required check passes, using a fresh nonce", async () => {
    bindReport(addr);
    const r = await verifyModelAttestation("test/model");
    expect(r.state).toBe("verified");
    expect(r.targets.map((t) => t.kind)).toEqual(["gateway", "model"]);
    expect(r.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(client.fetchAttestationReport.mock.calls[0][0].nonce).toBe(r.nonce);
  });

  it("uses a different nonce on every run", async () => {
    bindReport(addr);
    const a = await verifyModelAttestation("m");
    const b = await verifyModelAttestation("m");
    expect(a.nonce).not.toBe(b.nonce);
  });

  it("FAILS when the TDX quote does not verify", async () => {
    bindReport(addr);
    tdx.verified = false;
    expect((await verifyModelAttestation("m")).state).toBe("failed");
  });

  it("FAILS when the NVIDIA GPU verdict fails", async () => {
    bindReport(addr);
    gpu.pass = false;
    expect((await verifyModelAttestation("m")).state).toBe("failed");
  });

  it("FAILS when the quote replays an old nonce", async () => {
    client.fetchAttestationReport.mockImplementation(async () => {
      reportData.current = Buffer.concat([signingAddressPadded32(addr, "ecdsa"), Buffer.alloc(32, 1)]).toString("hex");
      return { model_attestations: [attestation(addr)] };
    });
    const r = await verifyModelAttestation("m");
    expect(r.state).toBe("failed");
    expect(r.targets[0].checks.find((c) => c.id === "report_data_nonce")!.status).toBe("fail");
  });

  it("is UNVERIFIED (never verified) when the endpoint is unreachable", async () => {
    client.fetchAttestationReport.mockRejectedValue(new Error("network down"));
    const r = await verifyModelAttestation("m");
    expect(r.state).toBe("unverified");
    // The raw upstream error goes to server logs, not to the user.
    expect(r.errors[0]).toMatch(/could not be retrieved/);
    expect(r.summary).not.toContain("network down");
  });

  it("is NOT CONNECTED without an API key and makes no request", async () => {
    delete process.env.NEAR_AI_API_KEY;
    __resetEnvForTests();
    const r = await verifyModelAttestation("m");
    expect(r.state).toBe("not-connected");
    expect(client.fetchAttestationReport).not.toHaveBeenCalled();
  });

  it("FAILS when only a gateway attestation (no GPU model) is returned", async () => {
    client.fetchAttestationReport.mockImplementation(async ({ nonce }: { nonce: string }) => {
      reportData.current = Buffer.concat([signingAddressPadded32(addr, "ecdsa"), Buffer.from(nonce, "hex")]).toString("hex");
      return { gateway_attestation: attestation(addr) };
    });
    expect((await verifyModelAttestation("m")).state).toBe("failed");
  });
});

describe("verifyCompletion", () => {
  const requestBody = '{"model":"m","messages":[],"stream":true}';
  const rawResponse = 'data: {"id":"c1"}\n\ndata: [DONE]\n\n';

  it("is VERIFIED only when signature, hashes and the signer's fresh attestation all pass", async () => {
    const w = Wallet.createRandom();
    const text = `${sha256Hex(requestBody)}:${sha256Hex(rawResponse)}`;
    client.fetchSignature.mockResolvedValue({ text, signature: await w.signMessage(text), signing_address: w.address });
    bindReport(w.address);
    const r = await verifyCompletion({ chatId: "c1", model: "m", requestBody, rawResponse, preferredAlgo: "ecdsa", e2ee: { enabled: false } });
    expect(r.state).toBe("verified");
    expect(client.fetchAttestationReport.mock.calls[0][0].signingAddress).toBe(w.address);
  });

  it("FAILS when the response hash does not match", async () => {
    const w = Wallet.createRandom();
    const text = `${sha256Hex(requestBody)}:${sha256Hex("something else")}`;
    client.fetchSignature.mockResolvedValue({ text, signature: await w.signMessage(text), signing_address: w.address });
    bindReport(w.address);
    const r = await verifyCompletion({ chatId: "c1", model: "m", requestBody, rawResponse, preferredAlgo: "ecdsa", e2ee: { enabled: false } });
    expect(r.state).toBe("failed");
  });

  it("FAILS when the signer has no matching attestation", async () => {
    const w = Wallet.createRandom();
    const text = `${sha256Hex(requestBody)}:${sha256Hex(rawResponse)}`;
    client.fetchSignature.mockResolvedValue({ text, signature: await w.signMessage(text), signing_address: w.address });
    bindReport(Wallet.createRandom().address);
    expect((await verifyCompletion({ chatId: "c1", model: "m", requestBody, rawResponse, preferredAlgo: "ecdsa", e2ee: { enabled: false } })).state).toBe("failed");
  });

  it("FAILS when E2EE was used without an attested key", async () => {
    const w = Wallet.createRandom();
    const text = `${sha256Hex(requestBody)}:${sha256Hex(rawResponse)}`;
    client.fetchSignature.mockResolvedValue({ text, signature: await w.signMessage(text), signing_address: w.address });
    bindReport(w.address);
    const r = await verifyCompletion({ chatId: "c1", model: "m", requestBody, rawResponse, preferredAlgo: "ecdsa", e2ee: { enabled: true, modelKeyAttested: false } });
    expect(r.state).toBe("failed");
  });

  it("is UNVERIFIED without a completion id", async () => {
    const r = await verifyCompletion({ chatId: null, model: "m", requestBody, rawResponse, preferredAlgo: "ecdsa", e2ee: { enabled: false } });
    expect(r.state).toBe("unverified");
    expect(client.fetchSignature).not.toHaveBeenCalled();
  });
}, 20_000);
