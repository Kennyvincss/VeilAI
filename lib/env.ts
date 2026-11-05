import "server-only";
import { z } from "zod";
import type { AppStatus } from "@/types";

/**
 * Server-side environment validation.
 *
 * Nothing in this module is ever sent to the browser except the boolean
 * feature flags returned by `getAppStatus()`. Secrets stay on the server.
 */

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const schema = z.object({
  NEXT_PUBLIC_APP_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_URL: optionalString.pipe(z.url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: optionalString,

  NEAR_AI_API_KEY: optionalString,
  NEAR_AI_BASE_URL: optionalString.pipe(z.url().optional()),
  NEAR_AI_MODEL: optionalString,
  NEAR_AI_E2EE: z.enum(["required", "preferred", "off"]).optional(),
  NEAR_AI_MAX_TOKENS: optionalString,
  DEMO_ALLOW_LIVE_AI: optionalString,

  NEXT_PUBLIC_NEAR_NETWORK: z.enum(["mainnet", "testnet"]).optional(),
  NEAR_RPC_URLS: optionalString,
  NEARBLOCKS_API_KEY: optionalString,
  FASTNEAR_API_KEY: optionalString,
  COINGECKO_API_KEY: optionalString,
  COINGECKO_API_PLAN: z.enum(["demo", "pro"]).optional(),
  ONECLICK_API_BASE: optionalString,

  DATA_ENCRYPTION_KEY: optionalString,
  APP_SECRET: optionalString,
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;
let issues: string[] = [];

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    // Fall back to an empty config so the app still boots in demo mode.
    cached = schema.parse({});
  } else {
    cached = parsed.data;
  }
  return cached;
}

/** Reset cache — used by tests only. */
export function __resetEnvForTests() {
  cached = null;
  issues = [];
}

export const NEAR_AI_DEFAULT_BASE_URL = "https://cloud-api.near.ai";
/**
 * Default model: served by NEAR AI from its own attested TEE infrastructure
 * (owned_by "nearai" in GET /v1/models). Verified end-to-end (TDX + GPU +
 * compose + E2EE key) against the live service. Third-party proxied models in
 * the catalogue (openai/…, anthropic/…, google/…) are NOT TEE-hosted.
 */
export const NEAR_AI_DEFAULT_MODEL = "deepseek-ai/DeepSeek-V4.1-Flash-1017";

export function nearAiConfig() {
  const env = getEnv();
  return {
    apiKey: env.NEAR_AI_API_KEY,
    baseUrl: (env.NEAR_AI_BASE_URL ?? NEAR_AI_DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: env.NEAR_AI_MODEL ?? NEAR_AI_DEFAULT_MODEL,
    e2ee: env.NEAR_AI_E2EE ?? "preferred",
    maxTokens: clampInt(env.NEAR_AI_MAX_TOKENS, 3000, 256, 8192),
    configured: Boolean(env.NEAR_AI_API_KEY),
  } as const;
}

export function supabaseConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function nearNetwork(): "mainnet" | "testnet" {
  return getEnv().NEXT_PUBLIC_NEAR_NETWORK ?? "mainnet";
}

/**
 * A 32-byte key for application-level encryption of stored free text
 * (conversation messages, financial goals). Accepts base64 or hex.
 */
export function dataEncryptionKey(): Buffer | null {
  const raw = getEnv().DATA_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

export function getAppStatus(): AppStatus {
  const env = getEnv();
  const ai = nearAiConfig();
  return {
    nearAi: {
      configured: ai.configured,
      baseUrl: ai.baseUrl,
      model: ai.model,
      e2eeMode: ai.e2ee,
    },
    supabase: { configured: supabaseConfigured() },
    dataEncryption: { configured: dataEncryptionKey() !== null },
    providers: {
      nearblocksKey: Boolean(env.NEARBLOCKS_API_KEY),
      coingeckoKey: Boolean(env.COINGECKO_API_KEY),
    },
    googleAuth: env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true",
    network: nearNetwork(),
    demoAllowsLiveAi: ai.configured && env.DEMO_ALLOW_LIVE_AI !== "false",
  };
}

/** Human readable configuration report, logged once at startup. */
export function configurationReport(): string[] {
  const env = getEnv();
  const lines: string[] = [...issues.map((i) => `Invalid environment variable — ${i}`)];
  if (!env.NEAR_AI_API_KEY)
    lines.push(
      "NEAR_AI_API_KEY is not set: the AI analyst runs in clearly-labelled DEMO mode and attestation shows NOT CONNECTED. Get a key at https://cloud.near.ai",
    );
  if (!supabaseConfigured())
    lines.push(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set: authentication and persistence are disabled; the dashboard runs as a demo.",
    );
  if (env.DATA_ENCRYPTION_KEY && !dataEncryptionKey())
    lines.push("DATA_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex chars or base64.");
  if (!env.DATA_ENCRYPTION_KEY && supabaseConfigured())
    lines.push(
      "DATA_ENCRYPTION_KEY is not set: stored chat messages and goals rely only on Supabase's encryption at rest (no application-level encryption).",
    );
  if (!env.APP_SECRET)
    lines.push("APP_SECRET is not set: a per-process random secret is used for signed nonces (fine for dev, set it in production).");
  return lines;
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
