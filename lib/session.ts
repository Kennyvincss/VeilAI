import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfigured } from "@/lib/env";
import { getSessionUser, type SessionUser } from "@/lib/supabase/server";

export interface RequestContext {
  user: SessionUser | null;
  supabase: SupabaseClient | null;
  supabaseConfigured: boolean;
}

/** Resolves who is making the request (signed-in user or nobody). */
export async function getRequestContext(): Promise<RequestContext> {
  const configured = supabaseConfigured();
  const { user, supabase } = await getSessionUser();
  return { user, supabase, supabaseConfigured: configured };
}
