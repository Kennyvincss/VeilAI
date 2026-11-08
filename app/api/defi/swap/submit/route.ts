import type { NextRequest } from "next/server";
import { z } from "zod";
import { accountIdSchema } from "@/lib/security/validation";
import { assertSameOrigin, clientIp, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { submitDepositTx } from "@/lib/defi/oneclick";

const schema = z.object({
  txHash: z.string().min(20).max(100).regex(/^[1-9A-HJ-NP-Za-km-z]+$/),
  depositAddress: z.string().min(2).max(128).regex(/^[a-zA-Z0-9._-]+$/),
  from: accountIdSchema,
});

/** Optional: tell 1Click about the deposit transaction so it is picked up faster. */
export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const limited = limitOrNull(`defi-submit:${clientIp(req)}`, { limit: 30, windowMs: 5 * 60_000 });
  if (limited) return limited;
  const parsed = schema.safeParse(await readJson(req).catch(() => ({})));
  if (!parsed.success) return jsonError(400, "Invalid request.");
  // Best-effort: 1Click also detects deposits on its own.
  await submitDepositTx(parsed.data.txHash, parsed.data.depositAddress, parsed.data.from).catch(() => undefined);
  return jsonOk({ ok: true });
}
