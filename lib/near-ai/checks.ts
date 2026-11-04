import { createHash, randomBytes } from "node:crypto";
import { verifyMessage } from "ethers";
import { ed25519 } from "@noble/curves/ed25519.js";
import type { VerificationCheck } from "@/types";
import type { RawAttestation, SignaturePayload } from "@/lib/near-ai/client";

/**
 * Pure verification checks, ported from NEAR's official verifier
 * (nearai/nearai-cloud-verifier, ts/model_verifier.ts & ts/chat_verifier.ts).
 * No network access happens here, so every check is unit-tested.
 */

export const sha256Hex = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const strip0x = (s: string) => s.replace(/^0x/i, "");

/** A fresh 32-byte random nonce (hex) for each attestation request. */
export function newNonce(): string {
  return randomBytes(32).toString("hex");
}

/** Signing address as 32 bytes, right-padded with zeros (per algo). */
export function signingAddressPadded32(signingAddress: string, algo: string): Buffer {
  const bytes = Buffer.from(algo.toLowerCase() === "ecdsa" ? strip0x(signingAddress) : strip0x(signingAddress), "hex");
  if (bytes.length > 32) throw new Error(`Signing address too long (${bytes.length} bytes)`);
  return Buffer.concat([bytes, Buffer.alloc(32 - bytes.length, 0)]);
}

/**
 * TDX report_data layout used by NEAR AI Cloud:
 *   [0..32)  = signing address (padded) — or SHA256(address || tls_fp) in TLS mode
 *   [32..64) = the raw 32-byte request nonce we supplied
 */
export function checkReportData(
  attestation: Pick<RawAttestation, "signing_address" | "signing_algo" | "tls_cert_fingerprint">,
  requestNonceHex: string,
  reportDataHex: string,
): VerificationCheck[] {
  const reportData = Buffer.from(strip0x(reportDataHex), "hex");
  const algo = (attestation.signing_algo ?? "ecdsa").toLowerCase();
  const first = reportData.subarray(0, 32);
  const second = reportData.subarray(32, Math.min(64, reportData.length));

  let expectedFirst: Buffer;
  let label: string;
  try {
    if (attestation.tls_cert_fingerprint) {
      expectedFirst = createHash("sha256")
        .update(Buffer.from(strip0x(attestation.signing_address), "hex"))
        .update(Buffer.from(attestation.tls_cert_fingerprint, "hex"))
        .digest();
      label = "Report data binds signing address + TLS fingerprint";
    } else {
      expectedFirst = signingAddressPadded32(attestation.signing_address, algo);
      label = "Report data binds signing address";
    }
  } catch (err) {
    return [
      { id: "report_data_address", label: "Report data binds signing address", status: "fail", required: true, detail: (err as Error).message },
      { id: "report_data_nonce", label: "Report data embeds our fresh nonce", status: "fail", required: true },
    ];
  }

  const binds = reportData.length >= 32 && first.equals(expectedFirst);
  const nonceBytes = Buffer.from(requestNonceHex, "hex");
  const embeds = nonceBytes.length === 32 && second.length === 32 && second.equals(nonceBytes);

  return [
    {
      id: "report_data_address",
      label,
      status: binds ? "pass" : "fail",
      required: true,
      detail: binds
        ? "The enclave's signing key is cryptographically bound to this hardware quote."
        : "The signing key in the report is not the one bound by the TDX quote.",
      expected: expectedFirst.toString("hex"),
      actual: first.toString("hex"),
    },
    {
      id: "report_data_nonce",
      label: "Report data embeds our fresh nonce (replay protection)",
      status: embeds ? "pass" : "fail",
      required: true,
      detail: embeds
        ? "The quote was generated in response to this request, not replayed."
        : "The quote does not contain the nonce we generated — it may be stale or replayed.",
      expected: requestNonceHex,
      actual: second.toString("hex"),
    },
  ];
}

export function parseTcbInfo(att: Pick<RawAttestation, "info">): Record<string, unknown> | null {
  const raw = att.info?.tcb_info;
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return raw as Record<string, unknown>;
}

/** mr_config must equal 0x01 || sha256(app_compose) — binds the exact container manifest. */
export function checkCompose(att: Pick<RawAttestation, "info">, mrConfigHex: string | null): {
  check: VerificationCheck;
  composeHash: string | null;
  imageDigests: string[];
  dockerCompose: string | null;
} {
  const tcb = parseTcbInfo(att);
  const appCompose = typeof tcb?.app_compose === "string" ? (tcb.app_compose as string) : null;
  if (!appCompose) {
    return {
      check: {
        id: "compose_binding",
        label: "Container manifest bound to quote (mr_config)",
        status: "fail",
        required: true,
        detail: "The attestation does not include an app_compose manifest, so the running code cannot be identified.",
      },
      composeHash: null,
      imageDigests: [],
      dockerCompose: null,
    };
  }
  const composeHash = sha256Hex(appCompose);
  const expected = `01${composeHash}`;
  const actual = strip0x(mrConfigHex ?? "").toLowerCase();
  const ok = actual.startsWith(expected);
  let dockerCompose: string | null = null;
  try {
    const parsed = JSON.parse(appCompose) as { docker_compose_file?: string };
    dockerCompose = typeof parsed.docker_compose_file === "string" ? parsed.docker_compose_file : null;
  } catch {
    dockerCompose = null;
  }
  return {
    check: {
      id: "compose_binding",
      label: "Container manifest bound to quote (mr_config)",
      status: ok ? "pass" : "fail",
      required: true,
      detail: ok
        ? "The verified quote's mr_config equals 0x01‖SHA-256(app_compose): the enclave runs exactly this published container manifest."
        : "mr_config does not match the hash of the reported compose manifest.",
      expected,
      actual: actual || "(missing)",
    },
    composeHash,
    imageDigests: extractImageDigests(appCompose),
    dockerCompose,
  };
}

export function extractImageDigests(compose: string): string[] {
  const out = new Set<string>();
  for (const m of compose.matchAll(/@sha256:([0-9a-f]{64})/g)) out.add(m[1]);
  return [...out];
}

/** Parse the signed text: "<req_hash>:<resp_hash>" or "<prefix>:<req_hash>:<resp_hash>". */
export function parseSignedText(text: string): { requestHash: string; responseHash: string } | null {
  const parts = text.split(":");
  if (parts.length === 2) return { requestHash: parts[0], responseHash: parts[1] };
  if (parts.length === 3) return { requestHash: parts[1], responseHash: parts[2] };
  return null;
}

/** Recover the signer of a NEAR AI completion signature. */
export function verifyCompletionSignature(payload: SignaturePayload, algo: "ecdsa" | "ed25519"): { valid: boolean; recovered: string | null; error?: string } {
  try {
    if (algo === "ecdsa") {
      const recovered = verifyMessage(payload.text, payload.signature);
      return { valid: recovered.toLowerCase() === payload.signing_address.toLowerCase(), recovered };
    }
    const sig = Buffer.from(strip0x(payload.signature), "hex");
    const pub = Buffer.from(strip0x(payload.signing_address), "hex");
    const valid = ed25519.verify(sig, new TextEncoder().encode(payload.text), pub);
    return { valid, recovered: valid ? payload.signing_address : null };
  } catch (err) {
    return { valid: false, recovered: null, error: err instanceof Error ? err.message : "signature parse error" };
  }
}

export function completionChecks(params: {
  payload: SignaturePayload;
  algo: "ecdsa" | "ed25519";
  requestBody: string;
  rawResponse: string;
  /** Alternate serialisations of the same response (non-streaming parity with the official verifier). */
  responseAlternates?: string[];
}): { checks: VerificationCheck[]; signer: string | null } {
  const parsed = parseSignedText(params.payload.text);
  const reqHash = sha256Hex(params.requestBody);
  const respCandidates = [params.rawResponse, ...(params.responseAlternates ?? [])].map((s) => sha256Hex(s));
  const sig = verifyCompletionSignature(params.payload, params.algo);
  const checks: VerificationCheck[] = [
    {
      id: "request_hash",
      label: "Signed request hash matches what VEIL AI sent",
      status: parsed && parsed.requestHash === reqHash ? "pass" : "fail",
      required: true,
      expected: reqHash,
      actual: parsed?.requestHash ?? params.payload.text,
    },
    {
      id: "response_hash",
      label: "Signed response hash matches what VEIL AI received",
      status: parsed && respCandidates.includes(parsed.responseHash) ? "pass" : "fail",
      required: true,
      expected: respCandidates[0],
      actual: parsed?.responseHash ?? "",
    },
    {
      id: "signature_valid",
      label: `${params.algo.toUpperCase()} signature recovers to the enclave signing key`,
      status: sig.valid ? "pass" : "fail",
      required: true,
      detail: sig.error,
      expected: params.payload.signing_address,
      actual: sig.recovered ?? "",
    },
  ];
  return { checks, signer: sig.valid ? params.payload.signing_address : null };
}

/**
 * A required check is satisfied by "pass", or by "warn" — used only for an
 * Intel TCB status of OutOfDate, which NEAR's official verifier accepts
 * because the quote's signature chain is still valid.
 */
export function allRequiredPass(checks: VerificationCheck[]): boolean {
  const required = checks.filter((c) => c.required);
  return required.length > 0 && required.every((c) => c.status === "pass" || c.status === "warn");
}

/** Decode a JWT payload without verifying (verification happens separately). */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isNvidiaPass(verdict: unknown): boolean {
  return verdict === true || verdict === "true" || verdict === "PASS" || verdict === "pass";
}
