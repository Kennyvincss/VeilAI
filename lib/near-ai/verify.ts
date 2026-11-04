import "server-only";
import type { AttestationTarget, VerificationCheck, VerificationResult } from "@/types";
import { nearAiConfig } from "@/lib/env";
import {
  fetchAttestationReport,
  fetchSignature,
  type AttestationReportResponse,
  type RawAttestation,
  type SignaturePayload,
} from "@/lib/near-ai/client";
import { allRequiredPass, checkCompose, checkReportData, completionChecks, newNonce } from "@/lib/near-ai/checks";
import { verifyGpu, verifyTdxQuote } from "@/lib/near-ai/hardware";
import { sleep } from "@/lib/blockchain/http";
import { log } from "@/lib/security/logger";

/**
 * Orchestrates NEAR AI Cloud attestation verification exactly as NEAR's
 * documented verifier does, then summarises it for the UI.
 *
 *   VERIFIED     — every required check passed for every target.
 *   FAILED       — evidence was obtained but at least one required check failed.
 *   UNVERIFIED   — evidence could not be obtained (not configured, network,
 *                  endpoint unavailable). Never shown as verified.
 */

export async function verifyTarget(
  kind: "gateway" | "model",
  att: RawAttestation,
  nonce: string,
  opts: { requireGpu: boolean },
): Promise<AttestationTarget> {
  const algo = (att.signing_algo ?? "ecdsa").toLowerCase();
  const checks: VerificationCheck[] = [];

  const [tdx, gpu] = await Promise.all([
    verifyTdxQuote(att.intel_quote),
    opts.requireGpu ? verifyGpu(att.nvidia_payload, nonce) : Promise.resolve(null),
  ]);
  checks.push(tdx.check);

  if (tdx.reportDataHex) {
    checks.push(...checkReportData(att, nonce, tdx.reportDataHex));
  } else {
    checks.push({
      id: "report_data_address",
      label: "Report data binds signing address",
      status: "fail",
      required: true,
      detail: "report_data unavailable because the quote could not be verified.",
    });
    checks.push({ id: "report_data_nonce", label: "Report data embeds our fresh nonce (replay protection)", status: "fail", required: true });
  }

  if (gpu) checks.push(...gpu.checks);

  const compose = checkCompose(att, tdx.mrConfigHex);
  checks.push(compose.check);
  if (compose.imageDigests.length > 0) {
    checks.push({
      id: "image_provenance",
      label: "Container image digests published for Sigstore provenance lookup",
      status: "pass",
      required: false,
      detail: compose.imageDigests.map((d) => `https://search.sigstore.dev/?hash=sha256:${d}`).join("\n"),
    });
  }

  return {
    kind,
    signingAddress: att.signing_address ?? null,
    signingAlgo: algo,
    checks,
    composeHash: compose.composeHash,
    mrConfig: tdx.mrConfigHex,
    tdxStatus: tdx.status,
    gpuVerdict: gpu?.verdict ?? null,
    imageDigests: compose.imageDigests,
    verified: allRequiredPass(checks),
  };
}

function modelAttestations(report: AttestationReportResponse): RawAttestation[] {
  if (Array.isArray(report.model_attestations) && report.model_attestations.length > 0) return report.model_attestations;
  if (report.intel_quote && report.signing_address) return [report as unknown as RawAttestation];
  return [];
}

function summarise(state: VerificationResult["state"], targets: AttestationTarget[], extra = ""): string {
  if (state === "verified")
    return `Verified: ${targets.length} TEE attestation(s) passed Intel TDX, report-data/nonce binding${targets.some((t) => t.kind === "model") ? ", NVIDIA GPU" : ""} and container-manifest checks.${extra}`;
  if (state === "failed") {
    const failed = targets.flatMap((t) => t.checks.filter((c) => c.required && c.status === "fail").map((c) => `${t.kind}: ${c.label}`));
    return `Verification failed — ${failed.slice(0, 3).join("; ") || "a required check did not pass"}.${extra}`;
  }
  return `Unverified — attestation evidence could not be obtained.${extra}`;
}

/**
 * Full model + gateway verification with a fresh random nonce (Privacy
 * Centre "Verify now").
 */
export async function verifyModelAttestation(model = nearAiConfig().model, signingAlgo: "ecdsa" | "ed25519" = "ecdsa"): Promise<VerificationResult> {
  const started = Date.now();
  const nonce = newNonce();
  const base: Omit<VerificationResult, "state" | "summary" | "completedAt" | "durationMs"> = {
    model,
    nonce,
    startedAt: new Date(started).toISOString(),
    targets: [],
    completionChecks: [],
    e2ee: { enabled: false },
    errors: [],
  };
  if (!nearAiConfig().configured) {
    return finish({ ...base, state: "not-connected", summary: "NEAR AI Cloud is not configured — no attestation available. Showing UNVERIFIED." }, started);
  }
  let report: AttestationReportResponse;
  try {
    report = await fetchAttestationReport({ model, nonce, signingAlgo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Attestation request failed";
    return finish({ ...base, state: "unverified", errors: [msg], summary: summarise("unverified", [], ` ${msg}`) }, started);
  }

  const tasks: Promise<AttestationTarget>[] = [];
  if (report.gateway_attestation) tasks.push(verifyTarget("gateway", report.gateway_attestation, nonce, { requireGpu: false }));
  for (const m of modelAttestations(report).slice(0, 3)) tasks.push(verifyTarget("model", m, nonce, { requireGpu: true }));
  if (tasks.length === 0) {
    return finish({ ...base, state: "unverified", errors: ["The attestation report contained no attestations."], summary: summarise("unverified", []) }, started);
  }
  const targets = await Promise.all(tasks);
  const hasModel = targets.some((t) => t.kind === "model");
  const state = hasModel && targets.every((t) => t.verified) ? "verified" : "failed";
  const errors = hasModel ? [] : ["No model attestation was returned; GPU TEE could not be verified."];
  log("info", "attestation.verified", { model, state, targets: targets.length, ms: Date.now() - started });
  return finish({ ...base, targets, errors, state, summary: summarise(state, targets) }, started);
}

/* ---------------- per-completion verification ---------------- */

async function fetchSignatureWithRetry(chatId: string, model: string, algos: ("ecdsa" | "ed25519")[]) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const algo of algos) {
      try {
        return { payload: await fetchSignature(chatId, model, algo), algo };
      } catch (err) {
        lastErr = err;
      }
    }
    await sleep(700 * (attempt + 1)); // signatures can lag the end of the stream slightly
  }
  throw lastErr instanceof Error ? lastErr : new Error("signature unavailable");
}

/**
 * Verifies a specific completion (as nearai-cloud-verifier/chat_verifier.ts):
 *  1. fetch the signature for chat_id
 *  2. compare request/response hashes with what we actually sent/received
 *  3. recover the signer
 *  4. fetch a FRESH attestation for that signing address with a new nonce
 *  5. verify TDX + report data + GPU + compose for it
 */
export async function verifyCompletion(params: {
  chatId: string | null;
  model: string;
  requestBody: string;
  rawResponse: string;
  responseAlternates?: string[];
  preferredAlgo: "ecdsa" | "ed25519";
  e2ee: VerificationResult["e2ee"];
}): Promise<VerificationResult> {
  const started = Date.now();
  const nonce = newNonce();
  const base = {
    model: params.model,
    nonce,
    startedAt: new Date(started).toISOString(),
    targets: [] as AttestationTarget[],
    completionChecks: [] as VerificationCheck[],
    chatId: params.chatId,
    e2ee: params.e2ee,
    errors: [] as string[],
  };
  if (!params.chatId) {
    return finish({ ...base, state: "unverified", errors: ["The completion did not include an id; it cannot be matched to a signature."], summary: "Unverified — no completion id." }, started);
  }

  let sig: { payload: SignaturePayload; algo: "ecdsa" | "ed25519" };
  try {
    const algos: ("ecdsa" | "ed25519")[] = params.preferredAlgo === "ecdsa" ? ["ecdsa", "ed25519"] : ["ed25519", "ecdsa"];
    sig = await fetchSignatureWithRetry(params.chatId, params.model, algos);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "signature unavailable";
    return finish({ ...base, state: "unverified", errors: [msg], summary: `Unverified — completion signature unavailable (${msg}).` }, started);
  }

  const { checks, signer } = completionChecks({
    payload: sig.payload,
    algo: sig.algo,
    requestBody: params.requestBody,
    rawResponse: params.rawResponse,
    responseAlternates: params.responseAlternates,
  });
  base.completionChecks = checks;

  if (!signer) {
    return finish({ ...base, state: "failed", summary: "Verification failed — the completion signature is invalid." }, started);
  }

  let report: AttestationReportResponse;
  try {
    report = await fetchAttestationReport({ model: params.model, nonce, signingAlgo: sig.algo, signingAddress: signer });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "attestation unavailable";
    return finish({ ...base, state: "unverified", errors: [msg], summary: `Unverified — signature valid, but attestation for the signer could not be fetched (${msg}).` }, started);
  }
  const match = modelAttestations(report).find((a) => a.signing_address?.toLowerCase() === signer.toLowerCase());
  if (!match) {
    return finish(
      { ...base, state: "failed", errors: [`No attestation found for signing address ${signer}`], summary: "Verification failed — the signer has no matching TEE attestation." },
      started,
    );
  }
  const target = await verifyTarget("model", match, nonce, { requireGpu: true });
  base.targets = [target];
  const ok = target.verified && allRequiredPass(checks) && (!params.e2ee.enabled || params.e2ee.modelKeyAttested === true);
  const state = ok ? "verified" : "failed";
  const extra = params.e2ee.enabled ? " Messages were end-to-end encrypted to the attested enclave key." : "";
  log("info", "completion.verified", { state, algo: sig.algo, ms: Date.now() - started });
  return finish({ ...base, state, summary: ok ? `Verified: this response was signed inside an attested TEE and the signed hashes match exactly what was sent and received.${extra}` : summarise("failed", [target]) }, started);
}

/* ---------------- E2EE key attestation ---------------- */

interface AttestedKey {
  publicKey: string;
  signingAddress: string;
  verifiedAt: number;
  target: AttestationTarget;
  nonce: string;
}
const keyCache = new Map<string, AttestedKey>();
const KEY_TTL_MS = 10 * 60_000;

/**
 * Obtains the model's Ed25519 encryption key and verifies, with a fresh
 * nonce, that it is bound to a genuine TEE before any data is encrypted to
 * it. For ed25519 the signing address IS the public key, and report_data
 * binds that address. Verified keys are cached for 10 minutes.
 */
export async function getAttestedEncryptionKey(model: string): Promise<{ key: AttestedKey | null; reason?: string }> {
  const cached = keyCache.get(model);
  if (cached && Date.now() - cached.verifiedAt < KEY_TTL_MS) return { key: cached };
  const nonce = newNonce();
  let report: AttestationReportResponse;
  try {
    report = await fetchAttestationReport({ model, nonce, signingAlgo: "ed25519" });
  } catch (err) {
    return { key: null, reason: err instanceof Error ? err.message : "attestation unavailable" };
  }
  const candidate = modelAttestations(report).find((a) => typeof a.signing_public_key === "string" && a.signing_public_key.length >= 64);
  if (!candidate?.signing_public_key) return { key: null, reason: "No Ed25519 encryption key in the model attestation." };
  const pub = candidate.signing_public_key.replace(/^0x/i, "").toLowerCase();
  const addr = (candidate.signing_address ?? "").replace(/^0x/i, "").toLowerCase();
  if (pub !== addr) return { key: null, reason: "Encryption key is not the attested signing key; refusing to encrypt to it." };
  const target = await verifyTarget("model", { ...candidate, signing_algo: "ed25519" }, nonce, { requireGpu: true });
  if (!target.verified) return { key: null, reason: "The enclave holding the encryption key failed attestation." };
  const key: AttestedKey = { publicKey: pub, signingAddress: candidate.signing_address, verifiedAt: Date.now(), target, nonce };
  keyCache.set(model, key);
  return { key };
}

function finish(r: Omit<VerificationResult, "completedAt" | "durationMs">, started: number): VerificationResult {
  return { ...r, completedAt: new Date().toISOString(), durationMs: Date.now() - started };
}
