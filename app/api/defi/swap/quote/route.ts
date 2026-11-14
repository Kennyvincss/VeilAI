import type { NextRequest } from "next/server";
import { assertSameOrigin, clientIp, HttpError, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { firstIssue } from "@/lib/security/validation";
import { DefiError, prepareSwap } from "@/lib/defi/service";
import { explainOneClickError, OneClickError, swapAvailability } from "@/lib/defi/oneclick";
import { quoteSchema } from "@/lib/defi/http";
import { log } from "@/lib/security/logger";

export const maxDuration = 30;

/**
 * Quote a swap via NEAR Intents 1Click. With dry=true it is a preview; with
 * dry=false it also returns the deposit transactions for the wallet to sign.
 */
export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const limited = limitOrNull(`defi-quote:${clientIp(req)}`, { limit: 30, windowMs: 5 * 60_000 });
  if (limited) return limited;
  const availability = swapAvailability();
  if (!availability.available) return jsonError(503, availability.reason === "testnet" ? "Swaps run on NEAR mainnet only." : "Swaps are coming soon.");
  try {
    const parsed = quoteSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, firstIssue(parsed.error));
    const r = await prepareSwap(parsed.data);
    return jsonOk({
      quote: {
        amountInFormatted: r.quote.quote.amountInFormatted,
        amountOutFormatted: r.quote.quote.amountOutFormatted,
        amountOutUsd: r.quote.quote.amountOutUsd,
        amountInUsd: r.quote.quote.amountInUsd,
        minAmountOut: r.quote.quote.minAmountOut,
        timeEstimate: r.quote.quote.timeEstimate,
        depositAddress: r.quote.quote.depositAddress ?? null,
        deadline: r.quote.quote.deadline ?? null,
      },
      origin: r.origin,
      destination: r.destination,
      plan: r.plan,
    });
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.message);
    if (err instanceof DefiError) return jsonError(err.status, err.message);
    if (err instanceof OneClickError) return jsonError(err.status === 400 ? 400 : 502, explainOneClickError(err));
    log("error", "defi.quote_failed", { hint: err instanceof Error ? err.message : "unknown" });
    return jsonError(502, "The swap could not be quoted right now. Please try again shortly.");
  }
}
