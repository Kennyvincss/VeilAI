import "server-only";
import type { DataSource } from "@/types";

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public status?: number,
  ) {
    super(`${provider}: ${message}`);
  }
}

export interface FetchJsonOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Next.js data cache revalidation (seconds). Omit for no caching. */
  revalidate?: number;
  retries?: number;
}

/** fetch → JSON with timeout, limited retries on 429/5xx and typed errors. */
export async function fetchJson<T>(provider: string, url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const retries = opts.retries ?? 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12_000);
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(opts.headers ?? {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
        ...(opts.revalidate !== undefined ? { next: { revalidate: opts.revalidate } } : { cache: "no-store" as const }),
      });
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        lastErr = new ProviderError(provider, `HTTP ${res.status}`, res.status);
        if (retryable && attempt < retries) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw lastErr;
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr =
        err instanceof ProviderError
          ? err
          : new ProviderError(provider, err instanceof Error && err.name === "AbortError" ? "timeout" : "network error");
      if (attempt < retries && !(err instanceof ProviderError && err.status && err.status < 500 && err.status !== 429)) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw lastErr;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Records which providers were used so every response can cite them. */
export class SourceTracker {
  private list: DataSource[] = [];
  add(name: string, url: string, purpose: string, ok: boolean, error?: string) {
    const existing = this.list.find((s) => s.name === name && s.purpose === purpose);
    if (existing) {
      existing.ok = existing.ok && ok;
      if (error) existing.error = error;
      return;
    }
    this.list.push({ name, url, purpose, fetchedAt: new Date().toISOString(), ok, ...(error ? { error } : {}) });
  }
  async track<T>(name: string, url: string, purpose: string, fn: () => Promise<T>): Promise<T> {
    try {
      const v = await fn();
      this.add(name, url, purpose, true);
      return v;
    } catch (err) {
      this.add(name, url, purpose, false, err instanceof Error ? err.message : "failed");
      throw err;
    }
  }
  all(): DataSource[] {
    return [...this.list];
  }
}
