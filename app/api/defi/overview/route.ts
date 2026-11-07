import type { NextRequest } from "next/server";
import { accountIdSchema } from "@/lib/security/validation";
import { clientIp, jsonError, jsonOk, limitOrNull } from "@/lib/security/http";
import { walletOverview } from "@/lib/defi/service";
import { defiErrorResponse } from "@/lib/defi/http";

export const maxDuration = 30;

/** Live balances for the connected wallet (public on-chain data). */
export async function GET(req: NextRequest) {
  const limited = limitOrNull(`defi-ov:${clientIp(req)}`, { limit: 40, windowMs: 5 * 60_000 });
  if (limited) return limited;
  const parsed = accountIdSchema.safeParse(req.nextUrl.searchParams.get("accountId") ?? "");
  if (!parsed.success) return jsonError(400, "Invalid account.");
  try {
    return jsonOk(await walletOverview(parsed.data));
  } catch (err) {
    return defiErrorResponse(err, "defi.overview_failed");
  }
}
