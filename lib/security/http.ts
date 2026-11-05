import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { getEnv } from "@/lib/env";

/** JSON error response with a stable shape. Never includes stack traces. */
export function jsonError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk<T>(data: T, init: { status?: number; cache?: string } = {}) {
  return NextResponse.json(data, {
    status: init.status ?? 200,
    headers: { "Cache-Control": init.cache ?? "no-store" },
  });
}

export function clientIp(req: NextRequest | Request): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * CSRF protection for state-changing requests: the Origin (or Referer) must
 * match this deployment. Combined with SameSite=Lax session cookies this
 * blocks cross-site form/fetch submissions.
 */
export function assertSameOrigin(req: NextRequest | Request): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const origin = req.headers.get("origin") ?? refererOrigin(req.headers.get("referer"));
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const allowed = new Set<string>();
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).origin);
    } catch {
      /* ignore malformed config */
    }
  }
  return allowed.has(origin);
}

function refererOrigin(ref: string | null): string | null {
  if (!ref) return null;
  try {
    return new URL(ref).origin;
  } catch {
    return null;
  }
}

/** Apply a named rate limit; returns a 429 response when exceeded. */
export function limitOrNull(key: string, policy: { limit: number; windowMs: number }) {
  const r = rateLimit(key, policy.limit, policy.windowMs);
  if (r.ok) return null;
  return NextResponse.json(
    { error: `Too many requests. Please retry in ${r.retryAfterSec}s.` },
    { status: 429, headers: { "Retry-After": String(r.retryAfterSec), "Cache-Control": "no-store" } },
  );
}

/** Parse a JSON body defensively with a size cap. */
export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new HttpError(413, "Request body too large");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request body too large");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Malformed JSON body");
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
