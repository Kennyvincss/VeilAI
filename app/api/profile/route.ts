import type { NextRequest } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/session";
import { getProfile, listWallets, NotSetUpError, setPayoutAccount, setUsername, UsernameTakenError } from "@/lib/supabase/repo";
import { assertSameOrigin, HttpError, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { accountIdSchema } from "@/lib/security/validation";
import { normalizeUsername, usernameLoginEnabled, usernameProblem } from "@/lib/usernames";

const NOT_SET_UP = "Usernames aren't set up on this server yet.";
const bodySchema = z.union([
  z.object({ username: z.string().max(40) }),
  z.object({ payoutAccount: accountIdSchema.nullable() }),
]);

/** The signed-in user's username, linked receiving wallet and verified wallets to choose from. */
export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonOk({ signedIn: false, setUp: true, profile: null, verifiedWallets: [], usernameLogin: usernameLoginEnabled() });
  try {
    const [profile, wallets] = await Promise.all([getProfile(ctx.supabase, ctx.user.id), listWallets(ctx.supabase, ctx.user.id)]);
    return jsonOk({
      signedIn: true,
      setUp: true,
      profile,
      verifiedWallets: wallets.filter((w) => w.ownershipVerified).map((w) => w.accountId),
      usernameLogin: usernameLoginEnabled(),
    });
  } catch (err) {
    if (err instanceof NotSetUpError) return jsonOk({ signedIn: true, setUp: false, profile: null, verifiedWallets: [], usernameLogin: false, notice: NOT_SET_UP });
    return jsonError(500, "Could not load your profile.");
  }
}

export async function PUT(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonError(401, "Create a free account to claim a username.");
  const limited = limitOrNull(`mut:${ctx.user.id}`, RATE_LIMITS.mutations);
  if (limited) return limited;
  try {
    const parsed = bodySchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, "Invalid request.");
    if ("username" in parsed.data) {
      const problem = usernameProblem(parsed.data.username);
      if (problem) return jsonError(400, problem);
      await setUsername(ctx.supabase, ctx.user.id, normalizeUsername(parsed.data.username));
    } else {
      await setPayoutAccount(ctx.supabase, ctx.user.id, parsed.data.payoutAccount);
    }
    return jsonOk({ profile: await getProfile(ctx.supabase, ctx.user.id) });
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.message);
    if (err instanceof NotSetUpError) return jsonError(503, NOT_SET_UP);
    if (err instanceof UsernameTakenError) return jsonError(409, "That username is taken.");
    return jsonError(400, err instanceof Error ? err.message : "Could not save.");
  }
}
