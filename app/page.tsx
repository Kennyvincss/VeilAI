import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  Cpu,
  Eye,
  FileText,
  Fingerprint,
  Gauge,
  KeyRound,
  Lock,
  Network,
  Radar,
  ScanSearch,
  ShieldCheck,
  Wallet,
  Workflow,
} from "lucide-react";
import { SiteNav } from "@/components/layout/site-nav";
import { Footer } from "@/components/layout/footer";
import { HeroVisual } from "@/components/landing/hero-visual";
import { FadeIn } from "@/components/landing/motion";
import { Faq } from "@/components/landing/faq";
import { buttonClass, SectionTitle } from "@/components/ui/primitives";

export default function LandingPage() {
  return (
    <>
      <SiteNav />
      <main id="main" className="overflow-x-clip">
        {/* HERO */}
        <section className="relative px-4 pb-20 pt-32 sm:px-6 sm:pt-40">
          <div className="grid-backdrop absolute inset-0 -z-10" aria-hidden />
          <div className="absolute left-1/2 top-0 -z-10 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]" aria-hidden />
          <div className="mx-auto max-w-4xl text-center">
            <FadeIn>
              <a href="#near" className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-card/70 px-3.5 py-1.5 text-xs text-muted transition-colors hover:text-text">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-soft" />
                Confidential inference on NEAR AI Cloud · free forever
                <ArrowRight className="h-3 w-3" />
              </a>
            </FadeIn>
            <FadeIn delay={0.05}>
              <h1 className="mt-7 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                <span className="text-gradient">Your Financial Intelligence.</span>
                <br />
                Nobody Else’s Business.
              </h1>
            </FadeIn>
            <FadeIn delay={0.1}>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
                Analyse your crypto portfolio, investigate wallets and receive intelligent financial insights through confidential AI processing powered by NEAR.
              </p>
            </FadeIn>
            <FadeIn delay={0.15}>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/dashboard" className={buttonClass("primary", "lg", "w-full sm:w-auto")}>
                  Launch VEIL AI <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#privacy" className={buttonClass("secondary", "lg", "w-full sm:w-auto")}>
                  <Eye className="h-4 w-4" /> Explore Privacy
                </a>
              </div>
              <p className="mt-4 text-xs text-subtle">
                Free · no seed phrases ·{" "}
                <Link href="/demo" className="underline decoration-dotted underline-offset-4 hover:text-muted">
                  explore a sample workspace
                </Link>
              </p>
            </FadeIn>
          </div>
          <div className="mt-16 sm:mt-20">
            <HeroVisual />
          </div>
        </section>

        {/* INTRO */}
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
            <FadeIn>
              <SectionTitle
                eyebrow="The product"
                title="A financial analyst that never sees your data in the clear."
                description="Crypto portfolios are public on-chain — but which wallets are yours, what you ask, and what you are worried about are not. VEIL AI combines live NEAR blockchain data, transparent risk models and a large language model running inside verifiable hardware enclaves."
              />
            </FadeIn>
            <FadeIn delay={0.1}>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Live NEAR data", "Balances, tokens, staking and history from public RPC & indexers"],
                  ["Transparent risk", "Seven scored categories with every input shown"],
                  ["TEE inference", "Intel TDX + NVIDIA GPU enclaves on NEAR AI Cloud"],
                  ["Verifiable", "Fresh-nonce attestation and signed responses, checked per answer"],
                ].map(([t, d]) => (
                  <div key={t} className="card p-5 transition-colors hover:border-border-strong">
                    <div className="text-sm font-semibold">{t}</div>
                    <div className="mt-1.5 text-xs leading-relaxed text-muted">{d}</div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <FadeIn>
              <SectionTitle center eyebrow="How VEIL AI works" title="From question to verified answer" description="Every AI answer goes through the same confidential pipeline." />
            </FadeIn>
            <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {[
                [Wallet, "1. Connect", "Link NEAR accounts by ID or prove ownership with a signed message. No keys, ever."],
                [Network, "2. Retrieve", "Public balances, tokens, prices and history are fetched server-side."],
                [Fingerprint, "3. Minimise", "Wallet IDs and counterparties are pseudonymised; only what the question needs is sent."],
                [Cpu, "4. Confidential inference", "Encrypted to an attested enclave key and processed inside NEAR AI Cloud's TEE."],
                [ShieldCheck, "5. Verify", "Response signature and a fresh TEE attestation are checked before showing VERIFIED."],
              ].map(([Icon, t, d], i) => {
                const I = Icon as typeof Wallet;
                return (
                  <FadeIn key={t as string} delay={i * 0.05}>
                    <div className="card h-full p-5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent-strong">
                        <I className="h-4.5 w-4.5" />
                      </div>
                      <div className="mt-4 text-sm font-semibold">{t as string}</div>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted">{d as string}</p>
                    </div>
                  </FadeIn>
                );
              })}
            </div>
          </div>
        </section>

        {/* PRIVACY */}
        <section id="privacy" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <FadeIn>
              <SectionTitle
                eyebrow="Privacy & confidential computing"
                title="Honest about what is protected — and what isn't."
                description="Trusted Execution Environments isolate computation in hardware so that operators, cloud providers and administrators cannot read data while it is processed. VEIL AI tells you exactly where that boundary is."
              />
            </FadeIn>
            <FadeIn delay={0.1}>
              <div className="mt-12 grid gap-3 sm:hidden">
                {PROTECTION_ROWS.map((r) => (
                  <div key={r[0]} className="rounded-2xl border border-border bg-card p-4">
                    <div className="text-sm font-semibold">{r[0]}</div>
                    <dl className="mt-2 space-y-1.5 text-xs">
                      {(["In transit", "During AI computation", "At rest"] as const).map((label, i) => (
                        <div key={label} className="flex justify-between gap-3">
                          <dt className="shrink-0 text-subtle">{label}</dt>
                          <dd className="text-right text-muted">{r[i + 1]}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
              <div className="mt-12 hidden overflow-x-auto rounded-2xl border border-border sm:block">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-card text-xs uppercase tracking-wider text-subtle">
                    <tr>
                      <th className="px-5 py-3 font-medium">Data</th>
                      <th className="px-5 py-3 font-medium">In transit</th>
                      <th className="px-5 py-3 font-medium">During AI computation</th>
                      <th className="px-5 py-3 font-medium">At rest</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-bg-2/60">
                    {PROTECTION_ROWS.map((r) => (
                      <tr key={r[0]}>
                        {r.map((c, i) => (
                          <td key={i} className={i === 0 ? "px-5 py-3.5 font-medium text-text" : "px-5 py-3.5 text-muted"}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-subtle">
                * End-to-end encryption is used when the model&apos;s encryption key can be verified inside an attested enclave; otherwise traffic is TLS to the NEAR AI gateway and the UI says so. VEIL AI&apos;s own application
                server processes your data in plaintext to assemble context — it is not inside a TEE.
              </p>
            </FadeIn>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <FadeIn>
              <SectionTitle center eyebrow="Features" title="Everything you need to understand your on-chain finances" />
            </FadeIn>
            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                [BrainCircuit, "AI Financial Analyst", "Streaming conversational analysis of your portfolio, risks and behaviour, with sources and verification on every answer."],
                [ScanSearch, "Wallet Intelligence", "Investigate any public NEAR account: activity timeline, counterparties, contract calls, large transfers and evidence-based indicators."],
                [Gauge, "Private Risk Engine", "Concentration (HHI), volatility, liquidity, exposure, drawdown and activity heuristics — every formula disclosed."],
                [ShieldCheck, "Privacy Centre", "Run live TEE attestation with a fresh nonce and inspect every check, value and container digest."],
                [FileText, "PDF Reports", "Portfolio, risk, wallet and AI summary reports with timestamps, sources and methodology, rendered in your browser."],
                [KeyRound, "Private AI memory", "Save goals and risk tolerance only if you choose. Inspect, edit or delete them any time."],
              ].map(([Icon, t, d], i) => {
                const I = Icon as typeof Wallet;
                return (
                  <FadeIn key={t as string} delay={(i % 3) * 0.05}>
                    <div className="card group h-full p-6 transition-all hover:-translate-y-0.5 hover:border-accent/30">
                      <I className="h-5 w-5 text-accent-strong transition-transform group-hover:scale-110" />
                      <div className="mt-4 font-semibold">{t as string}</div>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{d as string}</p>
                    </div>
                  </FadeIn>
                );
              })}
            </div>
          </div>
        </section>

        {/* NEAR */}
        <section id="near" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="glass overflow-hidden rounded-3xl p-6 sm:p-10">
              <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
                <FadeIn>
                  <SectionTitle
                    eyebrow="Built on NEAR"
                    title="NEAR is the infrastructure, not a logo."
                    description="Every NEAR integration below is implemented and running in the product today."
                  />
                </FadeIn>
                <FadeIn delay={0.1}>
                  <ul className="space-y-3">
                    {[
                      [Cpu, "NEAR AI Cloud", "OpenAI-compatible confidential inference (streaming) on TEE-hosted models."],
                      [ShieldCheck, "TEE attestation", "/v1/attestation/report + /v1/signature verified with Intel DCAP, NVIDIA NRAS and ECDSA/Ed25519."],
                      [Lock, "End-to-end encryption", "NEAR AI E2EE v2 (X25519 + XChaCha20-Poly1305) to the attested enclave key."],
                      [Workflow, "NEAR Intents", "1Click token list powers USD pricing and liquidity/routability signals."],
                      [Fingerprint, "NEAR wallets", "NEAR Connect sign-in with NEP-413 signed-message ownership proofs."],
                      [Radar, "NEAR Protocol data", "JSON-RPC, FastNEAR and NearBlocks for balances, tokens, staking and history."],
                    ].map(([Icon, t, d]) => {
                      const I = Icon as typeof Wallet;
                      return (
                        <li key={t as string} className="flex gap-4 rounded-2xl border border-border bg-bg-2/60 p-4">
                          <I className="mt-0.5 h-5 w-5 shrink-0 text-accent-strong" />
                          <div>
                            <div className="text-sm font-semibold">{t as string}</div>
                            <div className="mt-1 text-xs leading-relaxed text-muted">{d as string}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </FadeIn>
              </div>
            </div>
          </div>
        </section>

        {/* SECURITY */}
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2">
            <FadeIn>
              <SectionTitle
                eyebrow="Security & verification"
                title="VERIFIED means cryptographically verified."
                description="A green badge is easy to fake. VEIL AI shows you the evidence: every check, the nonce it generated, and the expected versus actual values."
              />
              <ul className="mt-8 space-y-2.5 text-sm text-muted">
                {[
                  "Fresh 32-byte random nonce per verification (replay protection)",
                  "Intel TDX quote verified against Intel PCS collateral",
                  "TDX report data binds the enclave signing key and our nonce",
                  "NVIDIA GPU evidence verified by NVIDIA's attestation service",
                  "Container manifest hash bound to the quote (mr_config)",
                  "Response signature recovers to the attested key; request & response hashes match",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {t}
                  </li>
                ))}
              </ul>
            </FadeIn>
            <FadeIn delay={0.1}>
              <div className="card p-6 font-mono text-xs leading-relaxed">
                <div className="mb-4 flex items-center justify-between font-sans">
                  <span className="text-sm font-semibold">Verification states</span>
                  <span className="text-[0.65rem] uppercase tracking-wider text-subtle">Shown in the Privacy Centre</span>
                </div>
                {[
                  ["NOT CONNECTED", "text-subtle", "No NEAR AI credentials — nothing to verify"],
                  ["INITIALISING", "text-accent-2", "Preparing context and fresh nonce"],
                  ["PROCESSING", "text-accent-strong", "Inference running inside the TEE"],
                  ["VERIFYING", "text-accent-2", "Checking quote, GPU evidence and signature"],
                  ["VERIFIED", "text-success", "All required checks passed"],
                  ["FAILED", "text-danger", "Evidence obtained but a check failed"],
                  ["UNVERIFIED", "text-warning", "Evidence could not be obtained"],
                ].map(([s, c, d]) => (
                  <div key={s} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                    <span className={`w-32 shrink-0 font-semibold ${c}`}>{s}</span>
                    <span className="text-muted">{d}</span>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <FadeIn>
              <SectionTitle center eyebrow="FAQ" title="Questions, answered plainly" />
            </FadeIn>
            <FadeIn delay={0.1} className="mt-10">
              <Faq />
            </FadeIn>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-24 sm:px-6">
          <FadeIn>
            <div className="mx-auto max-w-5xl rounded-3xl border border-white/70 bg-[radial-gradient(ellipse_at_top,rgba(207,195,255,0.55),transparent_70%)] bg-white/60 backdrop-blur px-6 py-14 text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your private data. Verified by NEAR.</h2>
              <p className="mx-auto mt-4 max-w-xl text-muted">Free. No subscriptions. No seed phrases. Start with the demo or create an account in seconds.</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/signup" className={buttonClass("primary", "lg")}>
                  Create free account
                </Link>
                <Link href="/demo" className={buttonClass("secondary", "lg")}>
                  Explore the demo
                </Link>
              </div>
            </div>
          </FadeIn>
        </section>
      </main>
      <Footer />
    </>
  );
}

const PROTECTION_ROWS: [string, string, string, string][] = [
  ["Your questions & AI answers", "TLS + E2EE to enclave*", "Inside TEE (Intel TDX + NVIDIA CC)", "Optional history · encrypted, owner-only access"],
  ["Portfolio context sent to AI", "TLS + E2EE to enclave*", "Inside TEE; wallet IDs pseudonymised", "Not stored by VEIL AI"],
  ["Preferences (AI memory)", "TLS", "Only if you enable “use in AI”", "Encrypted, owner-only access"],
  ["On-chain balances & transactions", "TLS", "—", "Public by nature on NEAR"],
  ["Email / account", "TLS", "Never sent to AI", "Secure authentication provider"],
];
