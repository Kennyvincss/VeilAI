import type { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertSameOrigin, clientIp, HttpError, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { emailForUsername, normalizeUsername, USERNAME_RE, usernameLoginEnabled } from "@/lib/usernames";
import { log } from "@/lib/security/logger";

const bodySchema = z.object({ identifier: z.string().trim().min(1).max(254), password: z.string().min(1).max(200) });
const GENERIC = "Incorrect username or password.";

/**
 * Username + password sign-in. The username is mapped to its email on the
 * server (never sent to the browser), then Supabase checks the password and
 * sets the session cookies. Errors are uniform so they don't reveal whether
 * a username exists.
 */
export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ipLimited = limitOrNull(`login-ip:${clientIp(req)}`, { limit: 10, windowMs: 10 * 60_000 });
  if (ipLimited) return ipLimited;
  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await readJson(req, 4 * 1024));
    if (!parsed.success) return jsonError(400, GENERIC);
    body = parsed.data;
  } catch (err) {
    return jsonError(err instanceof HttpError ? err.status : 400, GENERIC);
  }
  const username = normalizeUsername(body.identifier);
  if (!USERNAME_RE.test(username)) return jsonError(400, "Enter your username (or use your email).");
  const userLimited = limitOrNull(`login-user:${username}`, { limit: 10, windowMs: 10 * 60_000 });
  if (userLimited) return userLimited;
  if (!usernameLoginEnabled()) return jsonError(503, "Username sign-in isn't available right now. Please sign in with your email.");

  const supabase = await createSupabaseServerClient();
  if (!supabase) return jsonError(503, "Sign-in is temporarily unavailable.");
  let email: string | null;
  try {
    email = await emailForUsername(username);
  } catch {
    log("error", "auth.username_lookup_failed", {});
    return jsonError(503, "Username sign-in isn't available right now. Please sign in with your email.");
  }
  if (!email) return jsonError(401, GENERIC);
  const { error } = await supabase.auth.signInWithPassword({ email, password: body.password });
  if (error) {
    if (/confirm/i.test(error.message)) return jsonError(403, "Please confirm your email first — check your inbox for the link.");
    return jsonError(401, GENERIC);
  }
  return jsonOk({ ok: true });
}
