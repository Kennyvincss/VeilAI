import "server-only";
import type { PortfolioSnapshot } from "@/types";
import type { RequestContext } from "@/lib/session";
import { fetchLivePortfolio } from "@/lib/portfolio/service";
import { buildSnapshot } from "@/lib/portfolio/compute";
import { listWallets } from "@/lib/supabase/repo";

/** Live portfolio for the signed-in user (empty when nothing is tracked). */
export async function resolvePortfolio(ctx: RequestContext): Promise<PortfolioSnapshot> {
  const wallets = ctx.user && ctx.supabase ? await listWallets(ctx.supabase, ctx.user.id) : [];
  if (wallets.length === 0) {
    return buildSnapshot([], [], {
      mode: "live",
      sources: [],
      generatedAt: new Date().toISOString(),
      notes: ["No wallets tracked yet. Connect a NEAR wallet or add a public account ID to see live data."],
    });
  }
  return fetchLivePortfolio(wallets.map((w) => ({ accountId: w.accountId, label: w.label })));
}
