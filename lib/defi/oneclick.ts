import "server-only";
import { getEnv, nearNetwork } from "@/lib/env";
import { oneClickBase } from "@/lib/blockchain/prices";
import { log } from "@/lib/security/logger";

/**
 * NEAR Intents 1Click API (server-side only; the JWT never reaches the
 * browser). Request/response shapes follow @defuse-protocol/one-click-sdk-typescript.
 *   POST /v0/quote          — quote (dry run, or with a deposit address)
 *   GET  /v0/status         — execution status by deposit address
 *   POST /v0/deposit/submit — optional: tell 1Click the deposit tx hash
 */

export class OneClickError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

export interface OneClickQuoteRequest {
  dry: boolean;
  swapType: "EXACT_INPUT";
  slippageTolerance: number; // basis points
  originAsset: string;
  depositType: "ORIGIN_CHAIN";
  destinationAsset: string;
  amount: string; // base units
  refundTo: string;
  refundType: "ORIGIN_CHAIN";
  recipient: string;
  recipientType: "DESTINATION_CHAIN";
  deadline: string; // ISO
  referral?: string;
}

export interface OneClickQuote {
  depositAddress?: string;
  depositMemo?: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  minAmountIn: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountOut: string;
  deadline?: string;
  timeEstimate: number;
}

export interface OneClickQuoteResponse {
  correlationId: string;
  timestamp: string;
  signature: string;
  quoteRequest: OneClickQuoteRequest;
  quote: OneClickQuote;
}

export type OneClickStatus = "KNOWN_DEPOSIT_TX" | "PENDING_DEPOSIT" | "INCOMPLETE_DEPOSIT" | "PROCESSING" | "SUCCESS" | "REFUNDED" | "FAILED";

export function oneClickConfigured(): boolean {
  return Boolean(getEnv().ONECLICK_JWT);
}

/** Swaps need a 1Click JWT and NEAR mainnet (NEAR Intents doesn't run on testnet). */
export function swapAvailability(): { available: boolean; reason: "ok" | "testnet" | "not-configured" } {
  if (nearNetwork() !== "mainnet") return { available: false, reason: "testnet" };
  return oneClickConfigured() ? { available: true, reason: "ok" } : { available: false, reason: "not-configured" };
}

async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; query?: Record<string, string> } = { method: "GET" }): Promise<T> {
  const jwt = getEnv().ONECLICK_JWT;
  const url = new URL(`${oneClickBase()}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = "";
      try {
        const j = JSON.parse(text) as { message?: string; error?: string };
        detail = j.message ?? j.error ?? "";
      } catch {
        detail = text.slice(0, 160);
      }
      log("warn", "oneclick.error", { path, status: res.status, hint: detail.slice(0, 200) });
      throw new OneClickError(detail || `HTTP ${res.status}`, res.status);
    }
    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof OneClickError) throw err;
    log("warn", "oneclick.unreachable", { path, hint: err instanceof Error ? err.message : "unknown" });
    throw new OneClickError("unreachable");
  } finally {
    clearTimeout(timer);
  }
}

export function requestQuote(body: OneClickQuoteRequest) {
  return call<OneClickQuoteResponse>("/v0/quote", { method: "POST", body });
}

export function executionStatus(depositAddress: string) {
  return call<{ status: OneClickStatus; updatedAt: string; swapDetails?: Record<string, unknown> }>("/v0/status", { method: "GET", query: { depositAddress } });
}

export function submitDepositTx(txHash: string, depositAddress: string, nearSenderAccount: string) {
  return call<unknown>("/v0/deposit/submit", { method: "POST", body: { txHash, depositAddress, nearSenderAccount } });
}

/** User-facing explanation for a 1Click failure (details stay in server logs). */
export function explainOneClickError(err: unknown): string {
  if (!(err instanceof OneClickError)) return "The swap service could not complete this request. Please try again.";
  if (err.status === 401 || err.status === 403) return "Swaps are temporarily unavailable.";
  if (err.status === 400) {
    // 1Click returns readable validation messages (e.g. amount too low); safe to show.
    return /amount|low|minimum|liquidity|route|not supported|too/i.test(err.message) ? err.message : "This swap can't be quoted. Try a different amount or token.";
  }
  if (err.status === 429) return "The swap service is busy. Please wait a moment and try again.";
  return "The swap service could not be reached. Please try again shortly.";
}
