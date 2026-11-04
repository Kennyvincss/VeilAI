"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/format";

const ITEMS: { q: string; a: string }[] = [
  {
    q: "Is VEIL AI really free?",
    a: "Yes. There are no subscriptions, premium tiers or paywalls. VEIL AI never charges you. The deployer pays for NEAR AI Cloud inference; public data providers may rate-limit heavy use. VEIL AI never sends transactions, so you never pay network fees through it.",
  },
  {
    q: "Do you need my seed phrase or private key?",
    a: "Never. VEIL AI only reads public blockchain data by account ID. Wallet connection is used to prove you own an account by signing a harmless NEP-413 message that cannot move funds. If anything ever asks you for a seed phrase, it is a scam.",
  },
  {
    q: "What does “confidential AI” actually protect?",
    a: "Your question and financial context are processed by a model running inside a hardware Trusted Execution Environment (Intel TDX + NVIDIA GPU TEE) on NEAR AI Cloud. When end-to-end encryption is active, messages are encrypted to a key that we first verify lives inside that enclave, so the NEAR AI gateway only sees ciphertext. VEIL AI's own server still handles your data in plaintext to assemble context — see the Privacy Centre for the full breakdown.",
  },
  {
    q: "How do I know the attestation is real?",
    a: "VEIL AI generates a fresh random nonce for every verification, fetches the TEE attestation report, verifies the Intel TDX quote against Intel's collateral, checks that the quote embeds our nonce and the signing key, submits GPU evidence to NVIDIA's attestation service, and confirms the container manifest hash. Every check and its expected/actual values are shown. VERIFIED is only displayed when all required checks pass.",
  },
  {
    q: "Is my wallet data public?",
    a: "On-chain balances and transactions are public by nature — anyone can look them up. What VEIL AI protects is the private layer: which wallets you link together, the questions you ask, your preferences and the analysis you receive.",
  },
  {
    q: "Is this financial advice?",
    a: "No. VEIL AI provides informational analysis with transparent calculations. Risk scores are heuristics based on observable data, not guarantees. Always do your own research.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-card/60">
      {ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <h3>
              <button
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-text transition-colors hover:text-accent-strong sm:px-6"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
              >
                {item.q}
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", isOpen && "rotate-180")} />
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div id={`faq-${i}`} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted sm:px-6">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
