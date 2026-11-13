import { getRequestContext } from "@/lib/session";
import { resolvePortfolio } from "@/lib/portfolio/resolve";
import { liveRiskAnalysis } from "@/lib/risk/service";
import { jsonError, jsonOk, limitOrNull } from "@/lib/security/http";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { log } from "@/lib/security/logger";

export const maxDuration = 45;

export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx.user) return jsonError(401, "Sign in to continue.");
  const limited = limitOrNull(`risk:${ctx.user.id}`, RATE_LIMITS.portfolio);
  if (limited) return limited;
  try {
    const portfolio = await resolvePortfolio(ctx);
    return jsonOk(await liveRiskAnalysis(portfolio));
  } catch (err) {
    log("error", "risk.failed", { error: err instanceof Error ? err.message : "unknown" });
    return jsonError(502, "Risk analysis inputs are unavailable right now. Please retry shortly.");
  }
}
