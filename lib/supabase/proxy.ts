import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on each request and returns the
 * verified user (if any). Runs in the Next.js proxy.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = validUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key)
    return { response, userId: null as string | null, configured: false };

  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet)
            request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet)
            response.cookies.set(name, value, options);
          for (const [k, v] of Object.entries(headers ?? {}))
            response.headers.set(k, v);
        },
      },
    });
  } catch {
    // A misconfigured Supabase setting must never take the whole site down.
    return { response, userId: null as string | null, configured: false };
  }

  // getUser() revalidates the token with Supabase Auth.
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }
  return { response, userId, configured: true };
}

/** The Supabase URL if it is a well-formed http(s) URL, else null. */
function validUrl(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? v : null;
  } catch {
    return null;
  }
}
