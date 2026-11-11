import type { NextRequest } from "next/server";
import { clientIp, jsonError, jsonOk, limitOrNull } from "@/lib/security/http";
import { normalizeUsername, usernameAvailable, usernameProblem, UsernamesUnavailable } from "@/lib/usernames";

/** Public: is this username free? (Usernames are public identifiers.) */
export async function GET(req: NextRequest) {
  const limited = limitOrNull(`username-check:${clientIp(req)}`, { limit: 60, windowMs: 5 * 60_000 });
  if (limited) return limited;
  const u = normalizeUsername(req.nextUrl.searchParams.get("u") ?? "");
  const problem = usernameProblem(u);
  if (problem) return jsonOk({ username: u, available: false, problem });
  try {
    const available = await usernameAvailable(u);
    return jsonOk({ username: u, available, problem: available ? null : "That username is taken." });
  } catch (err) {
    if (err instanceof UsernamesUnavailable) return jsonOk({ username: u, available: null, problem: null });
    return jsonError(502, "Could not check the username.");
  }
}
