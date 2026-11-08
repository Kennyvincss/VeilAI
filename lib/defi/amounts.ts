/**
 * Exact decimal <-> base-unit conversion for token amounts. Never uses
 * floating point for values that end up in a transaction.
 */

export class AmountError extends Error {}

/** "1.5" with 24 decimals -> "1500000000000000000000000". Rejects anything ambiguous. */
export function toBaseUnits(input: string, decimals: number): string {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") throw new AmountError("Enter a valid amount");
  const [whole = "0", frac = ""] = s.split(".");
  if (frac.length > decimals) throw new AmountError(`At most ${decimals} decimal places for this token`);
  const raw = BigInt(whole || "0") * BigInt(10) ** BigInt(decimals) + BigInt((frac || "").padEnd(decimals, "0") || "0");
  if (raw <= BigInt(0)) throw new AmountError("Amount must be greater than zero");
  return raw.toString();
}

/** "1500000000000000000000000" with 24 decimals -> "1.5" (trimmed, exact). */
export function fromBaseUnits(raw: string | bigint, decimals: number, maxFraction = decimals): string {
  let v = typeof raw === "bigint" ? raw : BigInt(raw || "0");
  const neg = v < BigInt(0);
  if (neg) v = -v;
  const base = BigInt(10) ** BigInt(decimals);
  const whole = v / base;
  let frac = (v % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  if (decimals === 0) frac = "";
  return `${neg ? "-" : ""}${whole.toString()}${frac ? `.${frac}` : ""}`;
}

export const NEAR_DECIMALS = 24;
/** NEAR protocol storage price: 10^19 yoctoNEAR per byte (0.00001 NEAR/byte). */
export const STORAGE_PRICE_PER_BYTE = BigInt("10000000000000000000");
/** Kept back from "Max" so the account can still pay gas afterwards. */
export const GAS_RESERVE_YOCTO = BigInt("50000000000000000000000"); // 0.05 NEAR

/**
 * Spendable NEAR: total liquid balance minus the amount locked to pay for
 * the account's on-chain storage, minus a small gas reserve.
 */
export function spendableYocto(amountYocto: string, storageUsageBytes: number): bigint {
  const locked = BigInt(Math.max(0, Math.floor(storageUsageBytes))) * STORAGE_PRICE_PER_BYTE;
  const free = BigInt(amountYocto || "0") - locked - GAS_RESERVE_YOCTO;
  return free > BigInt(0) ? free : BigInt(0);
}

export function cmp(a: string, b: string | bigint): number {
  const x = BigInt(a);
  const y = typeof b === "bigint" ? b : BigInt(b);
  return x === y ? 0 : x > y ? 1 : -1;
}
