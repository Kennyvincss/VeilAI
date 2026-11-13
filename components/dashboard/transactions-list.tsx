"use client";

import { ArrowDownLeft, ArrowUpRight, Repeat, XCircle } from "lucide-react";
import type { NormalizedTx } from "@/types";
import { cn, formatAmount, shortAccount, timeAgo } from "@/lib/utils/format";

export function explorerTxUrl(hash: string, network: "mainnet" | "testnet") {
  return network === "testnet" ? `https://testnet.nearblocks.io/txns/${hash}` : `https://nearblocks.io/txns/${hash}`;
}

export function TransactionsList({ txs, network, limit = 10 }: { txs: (NormalizedTx & { wallet?: string })[]; network: "mainnet" | "testnet"; limit?: number }) {
  return (
    <ul className="divide-y divide-border">
      {txs.slice(0, limit).map((t) => {
        const Icon = t.success === false ? XCircle : t.direction === "in" ? ArrowDownLeft : t.direction === "out" ? ArrowUpRight : Repeat;
        const action = t.actions[0];
        const label = action?.method ? action.method : (action?.kind ?? "TX").replace(/_/g, " ").toLowerCase();
        const counterparty = t.direction === "in" ? t.signer : t.receiver;
        return (
          <li key={t.hash} className="flex items-center gap-3 py-2.5">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                t.success === false ? "bg-danger/10 text-danger" : t.direction === "in" ? "bg-success/10 text-success" : "bg-accent/10 text-accent-strong",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="truncate capitalize">{label}</span>
                {t.success === false && <span className="text-[0.65rem] uppercase text-danger">failed</span>}
              </div>
              <div className="truncate font-mono text-[0.7rem] text-subtle" title={counterparty}>
                {t.direction === "in" ? "from" : "to"} {shortAccount(counterparty, 14, 6)}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-xs">{t.depositNear > 0 ? `${t.direction === "in" ? "+" : t.direction === "out" ? "−" : ""}${formatAmount(t.depositNear, 3)} NEAR` : "—"}</div>
              <a href={explorerTxUrl(t.hash, network)} target="_blank" rel="noopener noreferrer" className="text-[0.65rem] text-subtle hover:text-accent-strong">
                {timeAgo(t.timestamp)} ↗
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
