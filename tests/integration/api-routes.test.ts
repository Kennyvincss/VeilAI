import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { RequestContext } from "@/lib/session";

/**
 * Route-level access control and validation tests. The session layer is
 * mocked so each test controls who is calling; providers are mocked so no
 * network access happens.
 */
const ctx: { current: RequestContext } = { current: { user: null, supabase: null, demo: false, supabaseConfigured: true } };
vi.mock("@/lib/session", () => ({ getRequestContext: async () => ctx.current }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined, getAll: () => [] }) }));
vi.mock("@/lib/wallet-intel/service", () => ({ investigateWallet: vi.fn(async () => { throw new Error("should not be called in these tests"); }) }));

import { POST as chatPOST } from "@/app/api/ai/chat/route";
import { GET as portfolioGET } from "@/app/api/portfolio/route";
import { POST as walletPOST, GET as walletGET } from "@/app/api/wallet/tracked/route";
import { POST as intelPOST } from "@/app/api/wallet/intelligence/route";
import { PUT as prefsPUT } from "@/app/api/preferences/route";
import { POST as verifyPOST } from "@/app/api/wallet/verify/route";
import { __resetRateLimitsForTests } from "@/lib/security/rate-limit";

const ORIGIN = "http://localhost:3000";
function req(path: string, init: { method?: string; body?: unknown; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: "localhost:3000", "content-type": "application/json" };
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  return new NextRequest(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
}
async function readNdjson(res: Response) {
  const text = await res.text();
  return text.trim().split("\n").map((l) => JSON.parse(l));
}

beforeEach(() => {
  __resetRateLimitsForTests();
  ctx.current = { user: null, supabase: null, demo: false, supabaseConfigured: true };
  delete process.env.NEAR_AI_API_KEY;
});

describe("access control", () => {
  it("rejects anonymous non-demo visitors", async () => {
    expect((await portfolioGET(req("/api/portfolio"))).status).toBe(401);
    expect((await chatPOST(req("/api/ai/chat", { method: "POST", body: { message: "hi" } }))).status).toBe(401);
  });

  it("demo visitors get clearly-labelled sample portfolio data", async () => {
    ctx.current = { ...ctx.current, demo: true };
    const res = await portfolioGET(req("/api/portfolio"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provenance.mode).toBe("demo");
  });

  it("demo visitors cannot write tracked wallets or preferences", async () => {
    ctx.current = { ...ctx.current, demo: true };
    expect((await walletPOST(req("/api/wallet/tracked", { method: "POST", body: { accountId: "alice.near" } }))).status).toBe(401);
    expect((await prefsPUT(req("/api/preferences", { method: "PUT", body: {} }))).status).toBe(401);
    const list = await (await walletGET()).json();
    expect(list.demo).toBe(true);
  });

  it("ownership verification requires a signed-in user", async () => {
    ctx.current = { ...ctx.current, demo: true };
    expect((await verifyPOST(req("/api/wallet/verify", { method: "POST", body: {} }))).status).toBe(401);
  });
});

describe("CSRF and validation", () => {
  it("rejects cross-origin state-changing requests", async () => {
    ctx.current = { ...ctx.current, demo: true };
    expect((await chatPOST(req("/api/ai/chat", { method: "POST", body: { message: "hi" }, origin: "https://evil.example" }))).status).toBe(403);
    expect((await chatPOST(req("/api/ai/chat", { method: "POST", body: { message: "hi" }, origin: null }))).status).toBe(403);
  });

  it("rejects seed phrases before anything is processed", async () => {
    ctx.current = { ...ctx.current, demo: true };
    const res = await chatPOST(req("/api/ai/chat", { method: "POST", body: { message: "abandon ability able about above absent absorb abstract absurd abuse access accident" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/seed phrase/i);
  });

  it("validates wallet intelligence input", async () => {
    ctx.current = { ...ctx.current, demo: true };
    expect((await intelPOST(req("/api/wallet/intelligence", { method: "POST", body: { accountId: "NOT VALID" } }))).status).toBe(400);
    const ok = await intelPOST(req("/api/wallet/intelligence", { method: "POST", body: { accountId: "alice.near", sample: true } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).provenance.mode).toBe("demo");
  });

  it("rate-limits anonymous AI usage", async () => {
    ctx.current = { ...ctx.current, demo: true };
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await chatPOST(req("/api/ai/chat", { method: "POST", body: { message: "Analyse my portfolio" } }));
      statuses.push(r.status);
      await r.text();
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });
});

describe("AI analyst in demo mode (no NEAR AI key)", () => {
  it("streams a labelled template answer and reports NOT CONNECTED, never verified", async () => {
    ctx.current = { ...ctx.current, demo: true };
    const res = await chatPOST(req("/api/ai/chat", { method: "POST", body: { message: "What are my biggest financial risks?" } }));
    expect(res.headers.get("content-type")).toContain("ndjson");
    const events = await readNdjson(res);
    const meta = events.find((e) => e.type === "meta");
    expect(meta.inference).toBe("demo-template");
    expect(meta.mode).toBe("demo");
    const text = events.filter((e) => e.type === "delta").map((e) => e.text).join("");
    expect(text).toMatch(/not produced by NEAR AI/i);
    const verification = events.find((e) => e.type === "verification").result;
    expect(verification.state).toBe("not-connected");
    expect(events.some((e) => e.type === "verification" && e.result.state === "verified")).toBe(false);
    expect(events.at(-1).type).toBe("done");
  });
});
