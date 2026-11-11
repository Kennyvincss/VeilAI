import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Cpu, FileSignature, Lock, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { buttonClass } from "@/components/ui/primitives";
import { RecheckEnclave } from "@/components/proof/recheck-enclave";
import { readProofToken, type Proof } from "@/lib/near-ai/proof";
import { verifyCompletionSignature } from "@/lib/near-ai/checks";

export const metadata: Metadata = {
  title: "Verified AI answer · proof",
  description: "Cryptographic proof that an answer was produced and signed inside a verified hardware enclave on NEAR AI Cloud.",
  robots: { index: false, follow: false },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-xs leading-relaxed text-text">{children}</dd>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  return status === "pass" || status === "warn" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <XCircle className="h-4 w-4 shrink-0 text-danger" />;
}

export default async function ProofPage({ params }: PageProps<"/proof/[token]">) {
  const { token } = await params;
  let raw = token;
  try {
    raw = decodeURIComponent(token);
  } catch {
    /* malformed escape: treated as an invalid proof below */
  }
  const proof = readProofToken(raw);
  if (!proof) return <Invalid />;
  const sig = verifyCompletionSignature({ text: proof.signature.text, signature: proof.signature.signature, signing_address: proof.signature.signingAddress }, proof.signature.algo);
  const [requestHash, responseHash] = proof.signature.text.split(":").slice(-2);

  return (
    <main id="main" className="relative min-h-screen px-4 py-10 sm:py-14">
      <div className="grid-backdrop absolute inset-0 -z-10" aria-hidden />
      <div className="mx-auto max-w-3xl">
        <Link href="/" aria-label="VEIL AI home" className="inline-block">
          <Logo />
        </Link>

        <section className="mt-8 rounded-3xl border border-success/30 bg-success/[0.05] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/15 text-success">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-success">Verified AI answer</p>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Produced inside a verified hardware enclave</h1>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            On {new Date(proof.verifiedAt).toUTCString()}, VEIL AI confirmed that an answer from <span className="font-mono text-text">{proof.model}</span> was signed by a key that lives inside a genuine
            Intel TDX + NVIDIA confidential-computing enclave on NEAR AI Cloud, and that the signed fingerprints match exactly what was sent and received.
            {proof.e2ee && " The conversation was also end-to-end encrypted to that enclave."}
          </p>
          <p className="mt-3 flex items-start gap-2 text-xs text-subtle">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> This page contains no question or answer text — only fingerprints (SHA-256 hashes) and check results.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileSignature className="h-4 w-4 text-accent-strong" /> Enclave signature
          </h2>
          <div className={`mt-2 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${sig.valid ? "border-success/25 bg-success/[0.05] text-success" : "border-danger/30 bg-danger/10 text-danger"}`}>
            {sig.valid ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {sig.valid ? "Signature re-checked just now: valid for the enclave key below." : "Signature does not verify."}
          </div>
          <dl className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
            <Row label="Signing key">{proof.signature.signingAddress}</Row>
            <Row label="Algorithm">{proof.signature.algo === "ecdsa" ? "ECDSA secp256k1 (EIP-191 message)" : "Ed25519"}</Row>
            <Row label="Request fingerprint">{requestHash}</Row>
            <Row label="Response fingerprint">{responseHash}</Row>
            <Row label="Signed text">{proof.signature.text}</Row>
            <Row label="Signature">{proof.signature.signature}</Row>
            {proof.chatId && <Row label="Completion ID">{proof.chatId}</Row>}
          </dl>
          <p className="mt-2 text-xs leading-relaxed text-subtle">
            Check it yourself: {proof.signature.algo === "ecdsa" ? "recover the signer of the signed text with any Ethereum library (e.g. ethers.verifyMessage) and compare it with the signing key." : "verify the Ed25519 signature over the signed text with the signing key as the public key."}
          </p>
        </section>

        {proof.enclave && <EnclaveChecks proof={proof} />}

        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Cpu className="h-4 w-4 text-accent-strong" /> Check the enclave again, right now
          </h2>
          <p className="mt-1 text-xs text-muted">Requests a fresh attestation for this signing key from NEAR AI Cloud with a new random nonce, and verifies it with Intel and NVIDIA.</p>
          <RecheckEnclave token={token} />
        </section>

        <section className="mt-6 grid gap-3 text-xs leading-relaxed text-muted sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="font-semibold text-text">What this proves</p>
            <p className="mt-1">The answer was generated and signed inside confidential hardware that even the cloud operator can&apos;t read, running the published software.</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="font-semibold text-text">What it doesn&apos;t prove</p>
            <p className="mt-1">That the answer is correct or good advice. AI output is informational only — not financial advice.</p>
          </div>
        </section>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          <Link href="/" className={buttonClass("primary", "md")}>
            What is VEIL AI?
          </Link>
          <Link href="/demo" className={buttonClass("secondary", "md")}>
            Try the demo
          </Link>
        </div>
        <p className="mt-6 text-[0.7rem] text-subtle">Proof issued by VEIL AI on {new Date(proof.issuedAt).toUTCString()}. The link is tamper-evident: changing any part of it invalidates it.</p>
      </div>
    </main>
  );
}

function EnclaveChecks({ proof }: { proof: Proof }) {
  const e = proof.enclave!;
  const checks = [...proof.completionChecks.map((c) => ({ ...c, required: true })), ...e.checks];
  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4 text-accent-strong" /> Checks at answer time
      </h2>
      <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2.5 px-4 py-2.5 text-sm">
            <StatusIcon status={c.status} />
            <span className="min-w-0 text-muted">
              {c.label}
              {!c.required && <span className="text-subtle"> (informational)</span>}
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
        {e.tdxStatus && <Row label="Intel TDX status">{e.tdxStatus}</Row>}
        {e.gpuVerdict && <Row label="NVIDIA GPU verdict">{e.gpuVerdict}</Row>}
        {e.composeHash && <Row label="Software (compose) hash">{e.composeHash}</Row>}
      </dl>
    </section>
  );
}

function Invalid() {
  return (
    <main id="main" className="relative flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="grid-backdrop absolute inset-0 -z-10" aria-hidden />
      <Link href="/" aria-label="VEIL AI home" className="mb-10">
        <Logo />
      </Link>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">This proof link isn&apos;t valid</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">It may be incomplete (copy the whole link), modified, or issued by a different VEIL AI deployment. Nothing on this page is shown as verified.</p>
      <Link href="/" className={`${buttonClass("secondary", "md")} mt-8`}>
        Back to home
      </Link>
    </main>
  );
}
