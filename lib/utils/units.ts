/**
 * Precise conversion of on-chain integer amounts to human numbers.
 * Uses BigInt to avoid float rounding on 24-decimal yoctoNEAR values.
 */

export const NEAR_DECIMALS = 24;

export function rawToNumber(raw: string | bigint | null | undefined, decimals: number): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  let big: bigint;
  try {
    big = typeof raw === "bigint" ? raw : BigInt(String(raw).split(".")[0]);
  } catch {
    return 0;
  }
  const negative = big < BigInt(0);
  if (negative) big = -big;
  const d = Math.max(0, Math.min(decimals, 64));
  const base = BigInt(10) ** BigInt(d);
  const whole = big / base;
  const frac = big % base;
  // Keep 12 significant fractional digits — more than enough for display/risk maths.
  const fracStr = d === 0 ? "" : frac.toString().padStart(d, "0").slice(0, 12);
  const value = Number(`${whole.toString()}${fracStr ? `.${fracStr}` : ""}`);
  return negative ? -value : value;
}

export function yoctoToNear(raw: string | bigint | null | undefined): number {
  return rawToNumber(raw, NEAR_DECIMALS);
}

/** NearBlocks returns nanosecond timestamps as strings or numbers. */
export function nanosToIso(ns: string | number | null | undefined): string {
  if (ns === null || ns === undefined) return new Date(0).toISOString();
  let ms: number;
  try {
    ms = Number(BigInt(String(ns).split(".")[0]) / BigInt(1_000_000));
  } catch {
    ms = Number.NaN;
  }
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}
