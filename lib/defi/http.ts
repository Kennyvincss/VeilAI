import "server-only";
import { z } from "zod";
import { accountIdSchema } from "@/lib/security/validation";
import { DefiError } from "@/lib/defi/service";
import { jsonError } from "@/lib/security/http";
import { log } from "@/lib/security/logger";

/** Shared request schemas for /api/defi/*. All amounts are decimal strings, converted with exact integer maths. */
export const amountSchema = z.string().trim().min(1, "Enter an amount").max(40).regex(/^\d*(\.\d*)?$/, "Enter a valid amount");
export const tokenSchema = z.union([z.literal("near"), accountIdSchema]);
export const assetIdSchema = z.string().max(200).regex(/^nep141:[a-z0-9._-]{2,128}$/, "Unsupported token");

/** "@alice" — a VEIL username, resolved server-side to its owner's verified wallet. */
export const usernameRefSchema = z.string().trim().toLowerCase().regex(/^@[a-z0-9_]{3,20}$/, "Enter a valid @username");
export const sendSchema = z.object({ from: accountIdSchema, to: z.union([usernameRefSchema, accountIdSchema]), token: tokenSchema, amount: amountSchema, memo: z.string().trim().max(120).optional().nullable(), contacts: z.array(accountIdSchema).max(100).optional() });
export const stakeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("stake"), from: accountIdSchema, pool: accountIdSchema, amount: amountSchema }),
  z.object({ action: z.literal("unstake"), from: accountIdSchema, pool: accountIdSchema, amount: amountSchema }),
  z.object({ action: z.literal("withdraw"), from: accountIdSchema, pool: accountIdSchema }),
]);
export const quoteSchema = z.object({
  from: accountIdSchema,
  originAssetId: assetIdSchema,
  destinationAssetId: assetIdSchema,
  amount: amountSchema,
  slippageBps: z.number().int().min(10).max(500),
  dry: z.boolean(),
});

/** Convert a thrown error into a safe JSON response. */
export function defiErrorResponse(err: unknown, event: string) {
  if (err instanceof DefiError) return jsonError(err.status, err.message);
  log("error", event, { hint: err instanceof Error ? err.message : "unknown" });
  return jsonError(502, "This request could not be completed right now. Please try again shortly.");
}
