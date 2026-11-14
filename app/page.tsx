import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Cpu,
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
import { VeilMask } from "@/components/ui/veil-mask";
import { FadeIn } from "@/components/landing/motion";
import { Faq } from "@/components/landing/faq";
import { buttonClass, SectionTitle } from "@/components/ui/primitives";

export default function LandingPage() {
  return (
    <>
      <div className="p-2 sm:p-4">
        <div className="mx-auto max-w-[1440px] overflow-clip rounded-[24px] bg-white shadow-[0_40px_80px_-40px_rgba(10,40,30,0.45)] sm:rounded-[32px]">
      <SiteNav />
      <main id="main" className="overflow-x-clip">
        {/* HERO */}
        <section className="relative px-3 pt-6 sm:px-5 lg:pt-10">
          <div className="mx-auto grid max-w-7xl items-center gap-y-6 px-2 sm:px-4 lg:grid-cols-[1.2fr_0.9fr_0.8fr] lg:gap-x-6 lg:pb-16">
            <FadeIn>
              <a href="#near" className="inline-flex items-center gap-2 rounded-full bg-card-2 px-3 py-1.5 text-xs text-muted transition-colors hover:text-text">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Private AI on NEAR · free forever
              </a>
              <h1 className="mt-5 text-[2.5rem] font-medium leading-[1.04] tracking-[-0.025em] text-accent sm:text-6xl lg:text-[4.1rem]">
                Your Financial Intelligence. Nobody Else’s Business.
              </h1>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/signup" className="group inline-flex items-center gap-3 rounded-full bg-card-2 py-1.5 pl-5 pr-1.5 text-[0.95rem] font-medium text-text ring-1 ring-border transition-colors hover:bg-[#e8eeea]">
                  Get started for free
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white transition-transform group-hover:rotate-45">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </Link>
                <Link href="/login" className="rounded-full px-4 py-2.5 text-sm font-medium text-muted hover:text-text">
                  Sign in
                </Link>
              </div>
            </FadeIn>
            <FadeIn delay={0.08} className="relative z-10 flex justify-center lg:-mb-40">
              <VeilMask className="h-72 w-60 sm:h-[22rem] sm:w-[18rem] lg:h-[27rem] lg:w-[22rem]" />
            </FadeIn>
            <FadeIn delay={0.14} className="lg:pl-4">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {[Lock, Cpu, ShieldCheck].map((I, i) => (
                    <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white ring-2 ring-white">
                      <I className="h-4 w-4" />
                    </span>
                  ))}
                </div>
                <span className="text-3xl font-medium tracking-tight text-accent">$0</span>
                <span className="text-xs leading-tight text-muted">
                  free, no
                  <br />
                  subscriptions
                </span>
              </div>
              <p className="mt-6 max-w-xs text-[0.95rem] leading-relaxed text-text/80">
                Analyse your crypto, check any wallet and get insights from an AI that runs inside verified secure hardware. No seed phrases, ever.
              </p>
            </FadeIn>
          </div>

          <div className="relative mt-6 overflow-hidden rounded-[22px] bg-[linear-gradient(180deg,#1f4b3b_0%,#173a2e_45%,#0e211a_100%)] px-5 pb-12 pt-16 sm:rounded-[28px] lg:mt-0 lg:pt-44">
            <div
              aria-hidden
              className="select-none bg-gradient-to-b from-white/80 via-white/45 to-white/5 bg-clip-text text-center font-medium leading-[0.95] tracking-[-0.04em] text-transparent"
              style={{ fontSize: "clamp(3rem, 10.5vw, 9.5rem)" }}
            >
              Private Intelligence
            </div>
            <div className="mx-auto mt-10 h-px max-w-6xl bg-white/15" />
            <h2 className="mt-10 text-center text-2xl font-medium tracking-tight text-white sm:text-3xl">Built on</h2>
            <ul className="mx-auto mt-7 flex max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-4 text-[0.95rem] text-white/70 sm:gap-x-14">
              {[
                [Network, "NEAR Protocol"],
                [BrainCircuit, "NEAR AI Cloud"],
                [Workflow, "NEAR Intents"],
                [Cpu, "Intel TDX"],
                [ShieldCheck, "NVIDIA Confidential Computing"],
              ].map(([Icon, name]) => {
                const I = Icon as typeof Network;
                return (
                  <li key={name as string} className="inline-flex items-center gap-2">
                    <I className="h-4 w-4" aria-hidden /> {name as string}
                  </li>
                );
              })}
            </ul>
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
            <div className="mx-auto max-w-5xl rounded-[28px] bg-[linear-gradient(180deg,#1f4b3b_0%,#0e211a_100%)] px-6 py-14 text-center text-white">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your private data. Verified by NEAR.</h2>
              <p className="mx-auto mt-4 max-w-xl text-white/70">Free. No subscriptions. No seed phrases. Create an account in seconds.</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/signup" className={buttonClass("white", "lg")}>
                  Get started for free
                </Link>
                <Link href="/login" className={buttonClass("outline", "lg", "border-white/25 text-white hover:bg-white/10")}>
                  Sign in
                </Link>
              </div>
            </div>
          </FadeIn>
        </section>
      </main>
      <Footer />
        </div>
      </div>
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
