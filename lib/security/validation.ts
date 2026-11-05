import { z } from "zod";
import { isValidAccountId, looksLikeSecret, normalizeAccountId } from "@/lib/near/account";

/**
 * Request validation schemas. Every API route parses its input with one of
 * these before touching any provider or database.
 */

export const accountIdSchema = z
  .string()
  .max(128)
  .transform(normalizeAccountId)
  .refine((v) => !looksLikeSecret(v), {
    message: "That looks like a private key or seed phrase. VEIL AI never needs it — never share it with anyone.",
  })
  .refine(isValidAccountId, { message: "Enter a valid NEAR account ID (e.g. alice.near or a 64-char implicit account)." });

export const chatRequestSchema = z.object({
  conversationId: z.uuid().optional().nullable(),
  message: z
    .string()
    .trim()
    .min(1, "Message is empty")
    .max(4000, "Message is too long (max 4000 characters)")
    .refine((v) => !looksLikeSecret(v), {
      message: "Your message looks like it contains a private key or seed phrase. It was NOT sent. Never share these.",
    }),
  /** Short client-held history for demo/ephemeral sessions. */
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(12)
    .optional(),
  demo: z.boolean().optional(),
  saveHistory: z.boolean().optional(),
  /** Structured, untrusted data (e.g. a wallet report) — sanitised and wrapped in a <data> block server-side. */
  attachment: z
    .object({ kind: z.enum(["wallet_intel"]), data: z.record(z.string(), z.unknown()) })
    .refine((a) => JSON.stringify(a.data).length <= 12_000, { message: "Attachment too large" })
    .optional(),
});

export const trackedWalletSchema = z.object({
  accountId: accountIdSchema,
  label: z.string().trim().max(40).optional().nullable(),
});

export const ownershipProofSchema = z.object({
  accountId: accountIdSchema,
  publicKey: z.string().regex(/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,50}$/, "Unsupported public key format"),
  signature: z.string().min(40).max(200),
  label: z.string().trim().max(40).optional().nullable(),
});

export const preferencesSchema = z.object({
  timeframe: z.enum(["short", "medium", "long"]).nullable(),
  riskTolerance: z.enum(["conservative", "balanced", "aggressive"]).nullable(),
  ecosystems: z.array(z.string().trim().min(1).max(32)).max(10),
  watchlist: z.array(z.string().trim().min(1).max(64)).max(25),
  goals: z
    .string()
    .trim()
    .max(600)
    .nullable()
    .refine((v) => !v || !looksLikeSecret(v), { message: "Goals must not contain secrets." }),
  useInAi: z.boolean(),
  saveChatHistory: z.boolean(),
});

export const reportRequestSchema = z.object({
  type: z.enum(["portfolio", "risk", "wallet", "ai-summary"]),
  accountId: accountIdSchema.optional(),
  demo: z.boolean().optional(),
  includeAi: z.boolean().optional(),
  save: z.boolean().optional(),
});

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request";
}
