import type { NextRequest } from "next/server";
import { getRequestContext } from "@/lib/session";
import { resolvePortfolio } from "@/lib/portfolio/resolve";
import { clientIp, jsonError, jsonOk, limitOrNull } from "@/lib/security/http";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { log } from "@/lib/security/logger";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const ctx = await getRequestContext();
  if (!ctx.user && !ctx.demo) return jsonError(401, "Sign in or start a demo session.");
  const limited = limitOrNull(`portfolio:${ctx.user?.id ?? clientIp(req)}`, RATE_LIMITS.portfolio);
  if (limited) return limited;
  try {
    return jsonOk(await resolvePortfolio(ctx));
  } catch (err) {
    log("error", "portfolio.failed", { error: err instanceof Error ? err.message : "unknown" });
    return jsonError(502, "Portfolio data providers are unavailable right now. Please retry shortly.");
  }
}
