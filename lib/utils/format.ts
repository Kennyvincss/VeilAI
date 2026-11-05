import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});
const usdFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function formatUsd(value: number | null | undefined, opts: { compact?: boolean } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (opts.compact && Math.abs(value) >= 10_000) return usdCompact.format(value);
  if (Math.abs(value) > 0 && Math.abs(value) < 0.01) return value < 0 ? "-<$0.01" : "<$0.01";
  return usdFull.format(value);
}

export function formatPct(value: number | null | undefined, opts: { sign?: boolean; digits?: number } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const digits = opts.digits ?? 2;
  const s = value.toFixed(digits);
  return `${opts.sign && value > 0 ? "+" : ""}${s}%`;
}

export function formatAmount(value: number | null | undefined, maxDigits = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 10 ** -maxDigits) return `<${10 ** -maxDigits}`;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.abs(value) >= 1000 ? 2 : maxDigits,
  }).format(value);
}

export function shortAccount(id: string, head = 8, tail = 6) {
  if (id.length <= head + tail + 3) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "—";
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
