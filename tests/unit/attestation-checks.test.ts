import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { Wallet } from "ethers";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  allRequiredPass,
  checkCompose,
  checkReportData,
  completionChecks,
  extractImageDigests,
  isNvidiaPass,
  newNonce,
  parseSignedText,
  sha256Hex,
  signingAddressPadded32,
} from "@/lib/near-ai/checks";
import { __enclaveForTests, createE2eeSession } from "@/lib/near-ai/e2ee";
import { nep413Hash, verifyNep413Signature } from "@/lib/near/nep413";
import { base58, base64 } from "@scure/base";

const ADDR = "0x1234567890abcdef1234567890ABCDEF12345678";

function reportDataFor(addr: string, nonceHex: string) {
  return Buffer.concat([signingAddressPadded32(addr, "ecdsa"), Buffer.from(nonceHex, "hex")]).toString("hex");
}

describe("fresh nonces", () => {
  it("are 32 random bytes and never repeat", () => {
    const a = newNonce();
    const b = newNonce();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe("TDX report_data binding (signing key + nonce)", () => {
  it("passes when the quote binds our address and nonce", () => {
    const nonce = newNonce();
    const checks = checkReportData({ signing_address: ADDR, signing_algo: "ecdsa" }, nonce, reportDataFor(ADDR, nonce));
    expect(checks.map((c) => c.status)).toEqual(["pass", "pass"]);
  });

  it("fails on a replayed quote (different nonce)", () => {
    const checks = checkReportData({ signing_address: ADDR, signing_algo: "ecdsa" }, newNonce(), reportDataFor(ADDR, newNonce()));
    expect(checks.find((c) => c.id === "report_data_nonce")!.status).toBe("fail");
    expect(allRequiredPass(checks)).toBe(false);
  });

  it("fails when the report binds a different signing key", () => {
    const nonce = newNonce();
    const checks = checkReportData({ signing_address: ADDR, signing_algo: "ecdsa" }, nonce, reportDataFor("0x" + "99".repeat(20), nonce));
    expect(checks.find((c) => c.id === "report_data_address")!.status).toBe("fail");
  });

  it("supports the TLS-fingerprint binding mode", () => {
    const nonce = newNonce();
    const fp = "ab".repeat(32);
    const first = createHash("sha256").update(Buffer.from(ADDR.slice(2), "hex")).update(Buffer.from(fp, "hex")).digest();
    const rd = Buffer.concat([first, Buffer.from(nonce, "hex")]).toString("hex");
    const checks = checkReportData({ signing_address: ADDR, signing_algo: "ecdsa", tls_cert_fingerprint: fp }, nonce, rd);
    expect(allRequiredPass(checks)).toBe(true);
  });

  it("supports ed25519 signing addresses", () => {
    const nonce = newNonce();
    const pub = "cd".repeat(32);
    const rd = Buffer.concat([Buffer.from(pub, "hex"), Buffer.from(nonce, "hex")]).toString("hex");
    expect(allRequiredPass(checkReportData({ signing_address: pub, signing_algo: "ed25519" }, nonce, rd))).toBe(true);
  });
});

describe("compose manifest binding (mr_config)", () => {
  const appCompose = JSON.stringify({ docker_compose_file: "services:\n  model:\n    image: vllm@sha256:" + "a".repeat(64) });
  it("passes when mr_config = 0x01 || sha256(app_compose)", () => {
    const r = checkCompose({ info: { tcb_info: JSON.stringify({ app_compose: appCompose }) } }, `0x01${sha256Hex(appCompose)}${"0".repeat(30)}`);
    expect(r.check.status).toBe("pass");
    expect(r.imageDigests).toEqual(["a".repeat(64)]);
    expect(r.dockerCompose).toContain("vllm@sha256");
  });
  it("fails on mismatch or missing manifest", () => {
    expect(checkCompose({ info: { tcb_info: { app_compose: appCompose } } }, "01" + "f".repeat(64)).check.status).toBe("fail");
    expect(checkCompose({ info: {} }, "01").check.status).toBe("fail");
  });
  it("extracts unique image digests", () => {
    expect(extractImageDigests(`x@sha256:${"b".repeat(64)} y@sha256:${"b".repeat(64)}`)).toHaveLength(1);
  });
});

describe("completion signatures", () => {
  const requestBody = JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }], stream: true });
  const rawResponse = 'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n';

  it("parses 2- and 3-part signed text", () => {
    expect(parseSignedText("a:b")).toEqual({ requestHash: "a", responseHash: "b" });
    expect(parseSignedText("m:a:b")).toEqual({ requestHash: "a", responseHash: "b" });
    expect(parseSignedText("a")).toBeNull();
  });

  it("verifies a genuine ECDSA (EIP-191) signature over the exact hashes", async () => {
    const w = Wallet.createRandom();
    const text = `${sha256Hex(requestBody)}:${sha256Hex(rawResponse)}`;
    const signature = await w.signMessage(text);
    const { checks, signer } = completionChecks({ payload: { text, signature, signing_address: w.address }, algo: "ecdsa", requestBody, rawResponse });
    expect(checks.every((c) => c.status === "pass")).toBe(true);
    expect(signer).toBe(w.address);
  });

  it("fails if the response was altered after signing", async () => {
    const w = Wallet.createRandom();
    const text = `${sha256Hex(requestBody)}:${sha256Hex(rawResponse)}`;
    const signature = await w.signMessage(text);
    const { checks } = completionChecks({ payload: { text, signature, signing_address: w.address }, algo: "ecdsa", requestBody, rawResponse: rawResponse + "tampered" });
    expect(checks.find((c) => c.id === "response_hash")!.status).toBe("fail");
    expect(allRequiredPass(checks)).toBe(false);
  });

  it("fails if the signature was produced by a different key", async () => {
    const text = `${sha256Hex(requestBody)}:${sha256Hex(rawResponse)}`;
    const signature = await Wallet.createRandom().signMessage(text);
    const { checks, signer } = completionChecks({ payload: { text, signature, signing_address: Wallet.createRandom().address }, algo: "ecdsa", requestBody, rawResponse });
    expect(checks.find((c) => c.id === "signature_valid")!.status).toBe("fail");
    expect(signer).toBeNull();
  });

  it("verifies Ed25519 completion signatures", () => {
    const seed = ed25519.utils.randomSecretKey();
    const pub = Buffer.from(ed25519.getPublicKey(seed)).toString("hex");
    const text = `${sha256Hex(requestBody)}:${sha256Hex(rawResponse)}`;
    const signature = Buffer.from(ed25519.sign(new TextEncoder().encode(text), seed)).toString("hex");
    const { checks } = completionChecks({ payload: { text, signature, signing_address: pub }, algo: "ed25519", requestBody, rawResponse });
    expect(allRequiredPass(checks)).toBe(true);
  });
});

describe("required-check semantics", () => {
  it("requires at least one required check and treats warn (TCB OutOfDate) as accepted", () => {
    expect(allRequiredPass([])).toBe(false);
    expect(allRequiredPass([{ id: "a", label: "", status: "skipped", required: false }])).toBe(false);
    expect(allRequiredPass([{ id: "tdx", label: "", status: "warn", required: true }])).toBe(true);
    expect(allRequiredPass([{ id: "a", label: "", status: "pass", required: true }, { id: "b", label: "", status: "fail", required: true }])).toBe(false);
    expect(allRequiredPass([{ id: "a", label: "", status: "pass", required: true }, { id: "b", label: "", status: "fail", required: false }])).toBe(true);
  });
  it("interprets NVIDIA verdicts strictly", () => {
    expect(isNvidiaPass(true)).toBe(true);
    expect(isNvidiaPass("true")).toBe(true);
    expect(isNvidiaPass(false)).toBe(false);
    expect(isNvidiaPass("false")).toBe(false);
    expect(isNvidiaPass(undefined)).toBe(false);
  });
});

describe("E2EE v2 (X25519 + HKDF-SHA256 + XChaCha20-Poly1305)", () => {
  it("encrypts so only the enclave can read, and decrypts the enclave's reply", () => {
    const enclave = __enclaveForTests();
    const session = createE2eeSession(enclave.publicKeyHex);
    const ct = session.encrypt("my portfolio question");
    expect(ct).toMatch(/^[0-9a-f]+$/);
    expect(ct).not.toContain(Buffer.from("portfolio").toString("hex"));
    expect(enclave.decryptFromClient(ct)).toBe("my portfolio question");
    const reply = enclave.encryptToClient("analysis", session.clientPublicKeyHex);
    expect(session.decrypt(reply)).toBe("analysis");
    expect(session.headers["X-Encryption-Version"]).toBe("2");
    expect(session.headers["X-Signing-Algo"]).toBe("ed25519");
  });
  it("rejects tampered or foreign ciphertext", () => {
    const enclave = __enclaveForTests();
    const session = createE2eeSession(enclave.publicKeyHex);
    const reply = enclave.encryptToClient("x", session.clientPublicKeyHex);
    const tampered = reply.slice(0, -2) + (reply.endsWith("00") ? "01" : "00");
    expect(session.tryDecrypt(tampered)).toBeNull();
    expect(session.tryDecrypt("plain text")).toBeNull();
    const other = createE2eeSession(enclave.publicKeyHex);
    expect(other.tryDecrypt(reply)).toBeNull();
  });
  it("rejects malformed model keys", () => {
    expect(() => createE2eeSession("abcd")).toThrow();
  });
});

describe("NEP-413 wallet ownership proofs", () => {
  const seed = ed25519.utils.randomSecretKey();
  const publicKey = `ed25519:${base58.encode(ed25519.getPublicKey(seed))}`;
  const nonce = new Uint8Array(32).fill(7);
  const message = "VEIL AI wallet ownership verification.";
  const recipient = "veil-ai";
  const signature = base64.encode(ed25519.sign(nep413Hash(message, nonce, recipient), seed));

  it("verifies a valid signed message", () => {
    expect(verifyNep413Signature({ message, nonce, recipient, publicKey, signature })).toBe(true);
  });
  it("rejects a different nonce (replay), message or recipient", () => {
    expect(verifyNep413Signature({ message, nonce: new Uint8Array(32).fill(8), recipient, publicKey, signature })).toBe(false);
    expect(verifyNep413Signature({ message: message + "!", nonce, recipient, publicKey, signature })).toBe(false);
    expect(verifyNep413Signature({ message, nonce, recipient: "evil", publicKey, signature })).toBe(false);
  });
  it("rejects a signature from another key", () => {
    const other = `ed25519:${base58.encode(ed25519.getPublicKey(ed25519.utils.randomSecretKey()))}`;
    expect(verifyNep413Signature({ message, nonce, recipient, publicKey: other, signature })).toBe(false);
  });
  it("uses the NEP-413 tag prefix 2^31+413", () => {
    const a = nep413Hash(message, nonce, recipient);
    expect(a).toHaveLength(32);
  });
});
