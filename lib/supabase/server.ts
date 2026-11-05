import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getEnv, supabaseConfigured } from "@/lib/env";

/**
 * Server-side Supabase client bound to the current request's cookies.
 * Uses the anon key: every query runs as the signed-in user and is
 * constrained by Row Level Security. The service-role key is never used
 * for user-facing requests.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured()) return null;
  const env = getEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component where cookies are read-only; the
          // proxy refreshes the session instead.
        }
      },
    },
  });
}

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * Returns the authenticated user, verified against Supabase Auth
 * (`getUser()` validates the JWT with the auth server — we never trust the
 * cookie contents alone).
 */
export async function getSessionUser(): Promise<{ user: SessionUser | null; supabase: SupabaseClient | null }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { user: null, supabase: null };
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { user: null, supabase };
  return { user: { id: data.user.id, email: data.user.email ?? null }, supabase };
}
