"use client";

import { useEffect, useState } from "react";
import { Boxes, Cpu, TrendingDown, TrendingUp } from "lucide-react";
import { cn, formatPct } from "@/lib/utils/format";

interface NetworkStatus {
  network: "mainnet" | "testnet";
  block: { height: number; timestamp: string } | null;
  near: { priceUsd: number | null; change24hPct: number | null };
  ai: { online: boolean };
  updatedAt: string;
}

/** Polls /api/network while the tab is visible. Shared by all instances on a page. */
const shared: { data: NetworkStatus | null; listeners: Set<(d: NetworkStatus) => void>; timer: ReturnType<typeof setInterval> | null } = {
  data: null,
  listeners: new Set(),
  timer: null,
};

async function poll() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  try {
    const res = await fetch("/api/network", { credentials: "same-origin" });
    if (!res.ok) return;
    const d = (await res.json()) as NetworkStatus;
    shared.data = d;
    shared.listeners.forEach((l) => l(d));
  } catch {
    /* keep last known value */
  }
}

export function useNetworkStatus(intervalMs = 20_000) {
  const [data, setData] = useState<NetworkStatus | null>(shared.data);
  useEffect(() => {
    shared.listeners.add(setData);
    if (!shared.timer) {
      void poll();
      shared.timer = setInterval(() => void poll(), intervalMs);
    }
    return () => {
      shared.listeners.delete(setData);
      if (shared.listeners.size === 0 && shared.timer) {
        clearInterval(shared.timer);
        shared.timer = null;
      }
    };
  }, [intervalMs]);
  return data;
}

const nf = new Intl.NumberFormat("en-US");

/** Compact live indicators: network + latest block, NEAR price, AI service. */
export function LiveStatus({ className, showAi = true }: { className?: string; showAi?: boolean }) {
  const s = useNetworkStatus();
  const up = (s?.near.change24hPct ?? 0) >= 0;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.72rem] text-muted", className)} aria-live="off">
      <span className="inline-flex items-center gap-1.5" title="Latest final block on NEAR">
        <span className="relative flex h-2 w-2">
          <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60", s?.block ? "animate-ping bg-success" : "bg-subtle")} />
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", s?.block ? "bg-success" : "bg-subtle")} />
        </span>
        <span className="capitalize">NEAR {s?.network ?? "mainnet"}</span>
        <Boxes className="ml-1 h-3 w-3 text-subtle" aria-hidden />
        <span className="font-mono tabular-nums text-text">{s?.block ? `#${nf.format(s.block.height)}` : "—"}</span>
      </span>
      <span className="inline-flex items-center gap-1.5" title="NEAR price (NEAR Intents / CoinGecko)">
        <span>NEAR</span>
        <span className="font-mono tabular-nums text-text">{s?.near.priceUsd != null ? `$${s.near.priceUsd.toFixed(s.near.priceUsd < 10 ? 3 : 2)}` : "—"}</span>
        {s?.near.change24hPct != null && (
          <span className={cn("inline-flex items-center gap-0.5 font-mono tabular-nums", up ? "text-success" : "text-danger")}>
            {up ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
            {formatPct(s.near.change24hPct, { sign: true })}
          </span>
        )}
      </span>
      {showAi && (
        <span className="inline-flex items-center gap-1.5" title="Confidential AI service (NEAR AI Cloud, TEE)">
          <Cpu className="h-3 w-3 text-subtle" aria-hidden />
          <span>Confidential AI</span>
          <span className={cn("font-medium", s ? (s.ai.online ? "text-success" : "text-warning") : "text-subtle")}>{s ? (s.ai.online ? "Online" : "Unavailable") : "—"}</span>
        </span>
      )}
    </div>
  );
}
