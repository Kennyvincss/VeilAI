import type { NextRequest } from "next/server";
import { clientIp, jsonOk, limitOrNull } from "@/lib/security/http";
import { swapTokens } from "@/lib/defi/service";
import { swapAvailability } from "@/lib/defi/oneclick";
import { defiErrorResponse } from "@/lib/defi/http";

/** NEAR-chain tokens routable through NEAR Intents. */
export async function GET(req: NextRequest) {
  const limited = limitOrNull(`defi-tokens:${clientIp(req)}`, { limit: 30, windowMs: 5 * 60_000 });
  if (limited) return limited;
  try {
    const { available, reason } = swapAvailability();
    if (reason === "testnet") return jsonOk({ tokens: [], available, reason });
    return jsonOk({ tokens: await swapTokens(), available, reason }, { cache: "public, max-age=60" });
  } catch (err) {
    return defiErrorResponse(err, "defi.swap_tokens_failed");
  }
}
