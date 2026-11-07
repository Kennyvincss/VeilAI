import { getPublicStatus } from "@/lib/env";
import { getRequestContext } from "@/lib/session";
import { jsonOk } from "@/lib/security/http";

/** Browser-safe status (see PublicStatus) plus the caller's session mode. */
export async function GET() {
  const ctx = await getRequestContext();
  return jsonOk({
    ...getPublicStatus(),
    session: { signedIn: Boolean(ctx.user), email: ctx.user?.email ?? null, demo: ctx.demo },
  });
}
