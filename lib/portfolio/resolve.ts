import "server-only";
import type { PortfolioSnapshot } from "@/types";
import type { RequestContext } from "@/lib/session";
import { demoPortfolio } from "@/lib/demo/data";
import { fetchLivePortfolio } from "@/lib/portfolio/service";
import { buildSnapshot } from "@/lib/portfolio/compute";
import { listWallets } from "@/lib/supabase/repo";

/** Portfolio for whoever is asking: live for signed-in users, sample for demo. */
export async function resolvePortfolio(ctx: RequestContext): Promise<PortfolioSnapshot> {
  if (!ctx.user || !ctx.supabase) return demoPortfolio();
  const wallets = await listWallets(ctx.supabase, ctx.user.id);
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
