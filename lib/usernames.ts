import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv, nearNetwork, supabaseConfigured } from "@/lib/env";

/**
 * VEIL usernames: sign in with username + password, and receive NEAR at
 * @username. Rules mirror the database (supabase/migrations/…_usernames.sql).
 */

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const RESERVED = new Set([
  "admin", "administrator", "root", "support", "help", "helpdesk", "security", "official", "team", "staff", "moderator", "mod",
  "veil", "veilai", "veil_ai", "near", "nearai", "near_ai", "nearprotocol", "near_protocol", "wallet", "system", "api", "null", "undefined",
  "billing", "payments", "payment", "refund", "refunds", "verify", "verification", "login", "signin", "signup", "account", "accounts",
]);

/** "@Alice " → "alice" (no validation). */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

export function usernameProblem(input: string): string | null {
  const u = normalizeUsername(input);
  if (!USERNAME_RE.test(u)) return "Usernames are 3–20 characters: lowercase letters, numbers and _.";
  if (RESERVED.has(u)) return "That username is reserved.";
  return null;
}

/** A stateless anon-key client for public RPCs (no user session). */
function anonClient(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  const env = getEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class UsernamesUnavailable extends Error {}

/** Is the username free? Throws UsernamesUnavailable when the feature isn't set up. */
export async function usernameAvailable(input: string): Promise<boolean> {
  if (usernameProblem(input)) return false;
  const db = anonClient();
  if (!db) throw new UsernamesUnavailable("not configured");
  const { data, error } = await db.rpc("username_available", { u: normalizeUsername(input) });
  if (error) throw new UsernamesUnavailable(error.message);
  return data === true;
}

/** @username → the NEAR account its owner linked (ownership-verified), or null. */
export async function resolveUsername(input: string): Promise<{ username: string; accountId: string } | null> {
  if (usernameProblem(input)) return null;
  const db = anonClient();
  if (!db) throw new UsernamesUnavailable("not configured");
  const { data, error } = await db.rpc("resolve_username", { u: normalizeUsername(input), net: nearNetwork() });
  if (error) throw new UsernamesUnavailable(error.message);
  const row = Array.isArray(data) ? (data[0] as { username: string; account_id: string } | undefined) : undefined;
  return row?.account_id ? { username: row.username, accountId: row.account_id } : null;
}

/** True when username sign-in can work (needs the server-only service role key). */
export function usernameLoginEnabled(): boolean {
  return supabaseConfigured() && Boolean(getEnv().SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Username → email, for username sign-in only. Uses the service role key,
 * server-side, solely to call a function that is granted to service_role
 * and nothing else. The email is never returned to the browser.
 */
export async function emailForUsername(input: string): Promise<string | null> {
  if (!USERNAME_RE.test(normalizeUsername(input))) return null;
  const env = getEnv();
  if (!usernameLoginEnabled()) return null;
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc("email_for_username", { u: normalizeUsername(input) });
  if (error) throw new UsernamesUnavailable(error.message);
  return typeof data === "string" && data ? data : null;
}
