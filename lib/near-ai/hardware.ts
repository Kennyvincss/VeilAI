import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { VerificationCheck } from "@/types";
import { decodeJwtPayload, isNvidiaPass } from "@/lib/near-ai/checks";

/**
 * Hardware attestation verifiers (network-bound).
 *
 *  - Intel TDX quotes: verified with Phala's dcap-qvl (the same library used
 *    by NEAR's official verifier) against Intel's PCS collateral.
 *  - NVIDIA GPU evidence: submitted to NVIDIA's Remote Attestation Service
 *    (NRAS); the returned EAT token's signature is additionally checked
 *    against NVIDIA's published JWKS.
 */

export const INTEL_PCCS_URL = "https://api.trustedservices.intel.com/tdx/certification/v4";
export const NVIDIA_NRAS_URL = "https://nras.attestation.nvidia.com/v3/attest/gpu";
export const NVIDIA_JWKS_URL = "https://nras.attestation.nvidia.com/.well-known/jwks.json";

export interface TdxResult {
  check: VerificationCheck;
  verified: boolean;
  status: string | null;
  reportDataHex: string | null;
  mrConfigHex: string | null;
}

type DcapModule = {
  js_verify: (rawQuote: Uint8Array, collateral: unknown, now: bigint) => unknown;
  js_get_collateral: (pccsUrl: string, rawQuote: Uint8Array) => Promise<unknown>;
};

let dcap: Promise<DcapModule> | null = null;
function loadDcap(): Promise<DcapModule> {
  dcap ??= import("@phala/dcap-qvl-node") as unknown as Promise<DcapModule>;
  return dcap;
}

/** Find the TD report body (TD10 for TDX 1.0 quotes, TD15 for 1.5). */
function tdReport(result: Record<string, unknown>): Record<string, string> {
  const report = (result.report ?? {}) as Record<string, unknown>;
  const td = (report.TD10 ?? report.TD15 ?? report.td10 ?? report.td15 ?? {}) as Record<string, unknown>;
  const base = (td.base ?? td) as Record<string, string>;
  return base;
}

export async function verifyTdxQuote(intelQuoteHex: string): Promise<TdxResult> {
  const label = "Intel TDX quote verified against Intel PCS collateral";
  try {
    const { js_get_collateral, js_verify } = await loadDcap();
    const raw = Uint8Array.from(Buffer.from(intelQuoteHex.replace(/^0x/i, ""), "hex"));
    const collateral = await js_get_collateral(INTEL_PCCS_URL, raw);
    const result = js_verify(raw, collateral, BigInt(Math.floor(Date.now() / 1000))) as Record<string, unknown>;
    const status = typeof result.status === "string" ? result.status : null;
    // Matches the official verifier: UpToDate is ideal; OutOfDate means the
    // platform TCB is below Intel's latest advisory baseline but the quote's
    // cryptography is valid.
    const verified = status ? status === "UpToDate" || status === "OutOfDate" : Boolean((result.quote as { verified?: boolean })?.verified);
    const td = tdReport(result);
    return {
      verified,
      status,
      reportDataHex: td.report_data ?? null,
      mrConfigHex: td.mr_config_id ?? null,
      check: {
        id: "tdx_quote",
        label,
        status: verified ? (status === "OutOfDate" ? "warn" : "pass") : "fail",
        // "warn" (OutOfDate) is accepted, mirroring NEAR's verifier; see allRequiredPass handling.
        required: true,
        detail: verified
          ? `TCB status: ${status ?? "verified"}.${status === "OutOfDate" ? " Platform TCB is below Intel's latest baseline; quote signature chain is valid." : ""}`
          : `TCB status: ${status ?? "unknown"}.`,
      },
    };
  } catch (err) {
    return {
      verified: false,
      status: null,
      reportDataHex: null,
      mrConfigHex: null,
      check: {
        id: "tdx_quote",
        label,
        status: "fail",
        required: true,
        detail: `Quote verification could not be completed: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`,
      },
    };
  }
}

const jwks = createRemoteJWKSet(new URL(NVIDIA_JWKS_URL), { timeoutDuration: 8_000, cooldownDuration: 60_000 });

export interface GpuResult {
  checks: VerificationCheck[];
  verdict: string | null;
}

export async function verifyGpu(nvidiaPayload: string | undefined, requestNonceHex: string): Promise<GpuResult> {
  if (!nvidiaPayload) {
    return {
      verdict: null,
      checks: [
        { id: "gpu_nonce", label: "GPU evidence carries our fresh nonce", status: "fail", required: true, detail: "No NVIDIA GPU evidence in the attestation." },
        { id: "gpu_verdict", label: "NVIDIA NRAS attestation verdict", status: "fail", required: true },
      ],
    };
  }
  let payload: { nonce?: string };
  try {
    payload = JSON.parse(nvidiaPayload) as { nonce?: string };
  } catch {
    return {
      verdict: null,
      checks: [{ id: "gpu_nonce", label: "GPU evidence carries our fresh nonce", status: "fail", required: true, detail: "Malformed GPU evidence." }],
    };
  }
  const nonceMatches = typeof payload.nonce === "string" && payload.nonce.toLowerCase() === requestNonceHex.toLowerCase();
  const checks: VerificationCheck[] = [
    {
      id: "gpu_nonce",
      label: "GPU evidence carries our fresh nonce",
      status: nonceMatches ? "pass" : "fail",
      required: true,
      expected: requestNonceHex,
      actual: payload.nonce ?? "",
    },
  ];

  let verdict: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(NVIDIA_NRAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: nvidiaPayload,
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timer));
    const text = await res.text();
    if (!res.ok) throw new Error(`NRAS HTTP ${res.status}`);
    const body = JSON.parse(text) as unknown;
    // NRAS v3 returns [["JWT", "<overall token>"], { "GPU-0": "<token>" , ...}]
    const jwt = Array.isArray(body) && Array.isArray(body[0]) ? String(body[0][1]) : null;
    if (!jwt) throw new Error("Unexpected NRAS response format");
    const claims = decodeJwtPayload(jwt);
    const raw = claims?.["x-nvidia-overall-att-result"];
    verdict = raw === undefined ? null : String(raw);
    checks.push({
      id: "gpu_verdict",
      label: "NVIDIA NRAS attestation verdict",
      status: isNvidiaPass(raw) ? "pass" : "fail",
      required: true,
      detail: `x-nvidia-overall-att-result = ${verdict ?? "missing"}`,
    });
    try {
      await jwtVerify(jwt, jwks);
      checks.push({ id: "gpu_token_signature", label: "NRAS token signed by NVIDIA (JWKS)", status: "pass", required: false });
    } catch (err) {
      checks.push({
        id: "gpu_token_signature",
        label: "NRAS token signed by NVIDIA (JWKS)",
        status: "warn",
        required: false,
        detail: `Token signature not verified: ${err instanceof Error ? err.message.slice(0, 120) : "unknown"} (verdict obtained over TLS from NVIDIA).`,
      });
    }
  } catch (err) {
    checks.push({
      id: "gpu_verdict",
      label: "NVIDIA NRAS attestation verdict",
      status: "fail",
      required: true,
      detail: `Could not obtain NVIDIA verdict: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`,
    });
  }
  return { checks, verdict };
}
