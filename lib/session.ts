import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfigured } from "@/lib/env";
import { getSessionUser, type SessionUser } from "@/lib/supabase/server";
import { DEMO_COOKIE } from "@/lib/supabase/proxy";

export interface RequestContext {
  user: SessionUser | null;
  supabase: SupabaseClient | null;
  /** True when the visitor is exploring without an account. */
  demo: boolean;
  supabaseConfigured: boolean;
}

/**
 * Resolves who is making the request. Authenticated users always take
 * precedence over the demo cookie.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const configured = supabaseConfigured();
  const { user, supabase } = await getSessionUser();
  if (user) return { user, supabase, demo: false, supabaseConfigured: configured };
  const store = await cookies();
  const demoCookie = store.get(DEMO_COOKIE)?.value === "1";
  return { user: null, supabase, demo: demoCookie || !configured, supabaseConfigured: configured };
}
