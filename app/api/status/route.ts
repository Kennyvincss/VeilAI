import { getAppStatus } from "@/lib/env";
import { getRequestContext } from "@/lib/session";
import { jsonOk } from "@/lib/security/http";

/** Public feature flags (booleans only — no secrets) plus the caller's mode. */
export async function GET() {
  const ctx = await getRequestContext();
  return jsonOk({
    ...getAppStatus(),
    session: { signedIn: Boolean(ctx.user), email: ctx.user?.email ?? null, demo: ctx.demo },
  });
}
