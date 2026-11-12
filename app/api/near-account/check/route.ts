import type { NextRequest } from "next/server";
import { clientIp, jsonError, jsonOk, limitOrNull } from "@/lib/security/http";
import { nearNetwork } from "@/lib/env";
import { viewAccount } from "@/lib/near/rpc";
import { newAccountNameProblem, topLevelFor } from "@/lib/username-rules";

/** Is name.near free on the NEAR network? */
export async function GET(req: NextRequest) {
  const limited = limitOrNull(`near-name-check:${clientIp(req)}`, { limit: 60, windowMs: 5 * 60_000 });
  if (limited) return limited;
  const name = (req.nextUrl.searchParams.get("name") ?? "").trim().toLowerCase();
  const accountId = `${name}.${topLevelFor(nearNetwork())}`;
  const problem = newAccountNameProblem(name);
  if (problem) return jsonOk({ name, accountId, available: false, problem });
  const acct = await viewAccount(accountId).catch(() => undefined);
  if (acct === undefined) return jsonError(502, "Couldn't check the NEAR network. Please try again.");
  return jsonOk({ name, accountId, available: acct === null, problem: acct === null ? null : `${accountId} is already taken.` });
}
