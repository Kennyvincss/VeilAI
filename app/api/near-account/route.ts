import { getRequestContext } from "@/lib/session";
import { jsonOk } from "@/lib/security/http";
import { nearNetwork } from "@/lib/env";
import { topLevelFor } from "@/lib/username-rules";
import { sponsorConfig, sponsoredAccountFor, sponsoredAccountsEnabled } from "@/lib/near/sponsor";

/** Is free "name.near" creation available, and has this user already created one? */
export async function GET() {
  const ctx = await getRequestContext();
  const network = nearNetwork();
  const enabled = sponsoredAccountsEnabled();
  let account: { accountId: string; status: string } | null = null;
  if (enabled && ctx.user) {
    const row = await sponsoredAccountFor(ctx.user.id).catch(() => null);
    if (row) account = { accountId: row.account_id, status: row.status };
  }
  return jsonOk({ enabled, signedIn: Boolean(ctx.user), network, suffix: topLevelFor(network), depositNear: sponsorConfig()?.depositNear ?? null, account });
}
