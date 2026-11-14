import type { NextRequest } from "next/server";
import { accountIdSchema, firstIssue } from "@/lib/security/validation";
import { assertSameOrigin, clientIp, HttpError, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { prepareStake, prepareUnstake, prepareWithdraw, stakingOverview, stakingPositions } from "@/lib/defi/service";
import { defiErrorResponse, stakeSchema } from "@/lib/defi/http";

export const maxDuration = 30;

/** Validators (top by stake, with fees) and, optionally, the account's positions. */
export async function GET(req: NextRequest) {
  const limited = limitOrNull(`defi-stake-get:${clientIp(req)}`, { limit: 30, windowMs: 5 * 60_000 });
  if (limited) return limited;
  const accountParam = req.nextUrl.searchParams.get("accountId");
  const account = accountParam ? accountIdSchema.safeParse(accountParam) : null;
  if (account && !account.success) return jsonError(400, "Invalid account.");
  try {
    const [overview, positions] = await Promise.all([stakingOverview(), account?.success ? stakingPositions(account.data) : Promise.resolve([])]);
    return jsonOk({ validators: overview.validators, networkAprPct: overview.networkAprPct, positions });
  } catch (err) {
    return defiErrorResponse(err, "defi.validators_failed");
  }
}

/** Prepare stake / unstake / withdraw for the user's wallet to sign. */
export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const limited = limitOrNull(`defi-stake:${clientIp(req)}`, { limit: 30, windowMs: 5 * 60_000 });
  if (limited) return limited;
  try {
    const parsed = stakeSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, firstIssue(parsed.error));
    const d = parsed.data;
    const plan = d.action === "stake" ? await prepareStake(d) : d.action === "unstake" ? await prepareUnstake(d) : await prepareWithdraw(d);
    return jsonOk(plan);
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.message);
    return defiErrorResponse(err, "defi.stake_failed");
  }
}
