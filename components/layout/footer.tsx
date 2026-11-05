import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            Confidential financial intelligence for crypto users. Free, with no subscriptions or paywalls. Built on NEAR AI Cloud.
          </p>
          <p className="mt-4 text-xs leading-relaxed text-subtle">
            Informational only — not financial, investment, tax or legal advice. Third-party API rate limits may apply. VEIL AI never executes transactions; if you choose to transact elsewhere, standard NEAR network gas fees apply.
          </p>
        </div>
        <FooterCol title="Product" links={[["Dashboard", "/dashboard"], ["AI Analyst", "/dashboard/analyst"], ["Wallet Intelligence", "/dashboard/wallet-intelligence"], ["Risk Engine", "/dashboard/risk-engine"]]} />
        <FooterCol title="Trust" links={[["Privacy Centre", "/dashboard/privacy"], ["Privacy architecture", "https://github.com/kennyvincss/VeilAI/blob/main/docs/PRIVACY.md"], ["Security", "https://github.com/kennyvincss/VeilAI/blob/main/docs/SECURITY.md"], ["NEAR integration", "https://github.com/kennyvincss/VeilAI/blob/main/docs/NEAR-INTEGRATION.md"]]} />
        <FooterCol title="NEAR" links={[["NEAR AI Cloud", "https://cloud.near.ai"], ["Attestation verifier", "https://github.com/nearai/nearai-cloud-verifier"], ["NEAR Intents", "https://docs.near-intents.org"], ["NEAR Protocol", "https://near.org"]]} />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-subtle sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} VEIL AI · NEAR Hackathon 2026 · Privacy & Private AI track</span>
          <span>Your financial intelligence. Your private data. Verified by NEAR.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{title}</div>
      <ul className="mt-4 space-y-2.5">
        {links.map(([label, href]) => (
          <li key={href}>
            {href.startsWith("http") ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-muted transition-colors hover:text-text">
                {label}
              </a>
            ) : (
              <Link href={href} className="text-sm text-muted transition-colors hover:text-text">
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
