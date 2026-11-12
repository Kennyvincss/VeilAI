"use client";

import { useEffect, useState } from "react";
import { Apple, ExternalLink, Globe, KeyRound, MonitorSmartphone, ShieldAlert, Smartphone, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { loadManifestWallets, type ManifestWallet } from "@/hooks/use-near-wallet";
import { cn } from "@/lib/utils/format";

/**
 * Create / import a NEAR wallet — the safe way.
 *
 * VEIL AI never generates keys and never accepts a recovery phrase. Users
 * create or import a wallet inside a trusted wallet app (listed in NEAR
 * Connect's official manifest), then connect it here.
 */

/** Consumer wallets we suggest, in order. Data (links, icons) comes from the official manifest at runtime. */
const SUGGESTED = ["meteor-wallet", "hot-wallet", "mynearwallet", "intear-wallet", "near-mobile", "okx-wallet", "hana-wallet"];

/** Snapshot of the official manifest, used only if it can't be loaded. */
const FALLBACK: ManifestWallet[] = [
  { id: "meteor-wallet", name: "Meteor Wallet", website: "https://meteorwallet.app/", platform: { web: "https://wallet.meteorwallet.app" } },
  { id: "hot-wallet", name: "HOT Wallet", website: "https://hot-labs.org/wallet", platform: { tga: "https://t.me/hot_wallet/app" } },
  { id: "mynearwallet", name: "MyNearWallet", website: "https://mynearwallet.com", platform: { web: "https://app.mynearwallet.com" } },
  { id: "intear-wallet", name: "Intear Wallet", website: "https://intea.rs/", platform: { web: "https://wallet.intear.tech" } },
];

const PLATFORM_LABEL: Record<string, { label: string; icon: typeof Globe }> = {
  web: { label: "Web", icon: Globe },
  ios: { label: "iPhone", icon: Apple },
  android: { label: "Android", icon: Smartphone },
  chrome: { label: "Chrome", icon: MonitorSmartphone },
  tga: { label: "Telegram", icon: Smartphone },
};

export type OnboardingMode = "create" | "import";

export function WalletOnboarding({
  open,
  mode,
  onModeChange,
  onClose,
  onConnect,
  network,
  onCreateHere,
  createSuffix = "near",
}: {
  open: boolean;
  mode: OnboardingMode;
  onModeChange: (m: OnboardingMode) => void;
  onClose: () => void;
  onConnect: () => void;
  network: "mainnet" | "testnet";
  /** When set, offer to create name.near right here (VEIL-sponsored, keys stay in the browser). */
  onCreateHere?: (() => void) | null;
  createSuffix?: string;
}) {
  const [wallets, setWallets] = useState<ManifestWallet[]>(FALLBACK);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadManifestWallets(network)
      .then((list) => {
        const picked = SUGGESTED.map((id) => list.find((w) => w.id === id)).filter((w): w is ManifestWallet => Boolean(w));
        if (!cancelled && picked.length) setWallets(picked);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, network]);

  return (
    <Modal open={open} onClose={onClose} wide title={mode === "create" ? "Create a NEAR wallet" : "Import an existing wallet"} description="Free, and takes about a minute. Your keys stay in your wallet — never in VEIL AI.">
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-border bg-bg p-1" role="tablist">
        {(["create", "import"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => onModeChange(m)}
            className={cn("rounded-lg px-3 py-2 text-sm font-medium transition-colors", mode === m ? "bg-accent/15 text-text" : "text-muted hover:text-text")}
          >
            {m === "create" ? "Create new" : "Import existing"}
          </button>
        ))}
      </div>

      {network === "testnet" && (
        <p className="mb-4 rounded-xl border border-[#60a5fa]/30 bg-[#60a5fa]/[0.06] px-3.5 py-2.5 text-xs leading-relaxed text-accent-2">
          This app is on <strong>NEAR testnet</strong>. Use a testnet account (for example at testnet.mynearwallet.com, or switch your wallet&apos;s network to testnet), then get free test NEAR from{" "}
          <a href="https://near-faucet.io" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
            near-faucet.io
          </a>
          .
        </p>
      )}

      {mode === "create" && onCreateHere && (
        <div className="mb-5 rounded-3xl border border-lavender bg-lavender/20 p-4">
          <div className="text-sm font-semibold">Easiest: get your own name.{createSuffix} here</div>
          <p className="mt-1 text-xs leading-relaxed text-muted">A real NEAR account that works in every NEAR wallet. Your browser makes the keys; VEIL AI never sees them and pays the small creation fee.</p>
          <Button size="sm" className="mt-3" onClick={onCreateHere}>
            <Sparkles className="h-3.5 w-3.5" /> Create name.{createSuffix}
          </Button>
          <p className="mt-3 text-[0.7rem] text-subtle">Or create one in a wallet app:</p>
        </div>
      )}

      {mode === "create" ? (
        <ol className="mb-5 space-y-2 text-sm text-muted">
          <Step n={1}>Pick a wallet below and open it.</Step>
          <Step n={2}>Choose “Create wallet”. Write your recovery phrase down on paper and keep it offline — it is the only way to restore your wallet.</Step>
          <Step n={3}>Come back here and press <strong className="text-text">Connect wallet</strong>.</Step>
        </ol>
      ) : (
        <>
          <div className="mb-4 flex gap-3 rounded-xl border border-warning/30 bg-warning/[0.07] p-3.5 text-sm">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <p className="text-warning/90">
              <strong className="font-semibold text-warning">Never type your recovery phrase into a website</strong> — including VEIL AI. Import it only inside an official wallet app. Anyone asking for it is trying to steal your funds.
            </p>
          </div>
          <ol className="mb-5 space-y-2 text-sm text-muted">
            <Step n={1}>Open a wallet below (or the one you already use).</Step>
            <Step n={2}>Choose “Import wallet” and enter your recovery phrase <em>inside the wallet app</em>.</Step>
            <Step n={3}>Come back here and press <strong className="text-text">Connect wallet</strong>.</Step>
          </ol>
        </>
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        {wallets.map((w) => {
          const links = Object.entries(w.platform ?? {}).filter(([k]) => PLATFORM_LABEL[k]);
          const primary = w.platform?.web ?? w.website;
          return (
            <li key={w.id} className="rounded-xl border border-border bg-card p-3.5">
              <div className="flex items-center gap-3">
                <WalletIcon src={w.icon} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{w.name}</div>
                  {primary && (
                    <a href={primary} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-strong hover:underline">
                      Open {w.name.replace(/ Wallet$/, "")} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
              {links.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {links.map(([k, url]) => {
                    const P = PLATFORM_LABEL[k];
                    return (
                      <a key={k} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[0.7rem] text-muted hover:border-border-strong hover:text-text">
                        <P.icon className="h-3 w-3" /> {P.label}
                      </a>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[0.7rem] leading-relaxed text-subtle">Wallets are independent apps listed by NEAR Connect. VEIL AI is not affiliated with them and never sees your keys.</p>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button
          onClick={() => {
            onClose();
            onConnect();
          }}
        >
          <Sparkles className="h-4 w-4" /> I have a wallet — connect it
        </Button>
      </div>
    </Modal>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent-strong">{n}</span>
      <span className="pt-0.5 leading-relaxed">{children}</span>
    </li>
  );
}

/** Remote wallet icon with a neutral fallback if it fails to load (blocked host, broken link). */
function WalletIcon({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-strong">
        <KeyRound className="h-4 w-4" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- wallet icons come from the official NEAR Connect manifest (remote, many hosts)
    <img src={src} alt="" className="h-9 w-9 shrink-0 rounded-xl bg-black/[0.04] object-contain" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}
