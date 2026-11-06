import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalystEvent } from "@/lib/ai/analyst";

/**
 * When the deployment's NEAR AI account has no credits (HTTP 402), the
 * analyst must fall back to a clearly-labelled template answer and must
 * never mark it as verified.
 */
vi.mock("@/lib/near-ai/client", async (orig) => {
  const actual = await orig<typeof import("@/lib/near-ai/client")>();
  return {
    ...actual,
    streamChatCompletion: vi.fn(async () => {
      throw new actual.NearAiError("NEAR AI Cloud responded 402: No spending limit configured.", 402);
    }),
  };
});
vi.mock("@/lib/near-ai/verify", () => ({
  getAttestedEncryptionKey: vi.fn(async () => ({ key: null, reason: "test: no key" })),
  verifyCompletion: vi.fn(async () => {
    throw new Error("verifyCompletion must not run for a template answer");
  }),
}));

import { runAnalyst } from "@/lib/ai/analyst";
import { __resetEnvForTests } from "@/lib/env";
import { templateAnswer } from "@/lib/demo/responses";
import { demoPortfolio, demoRiskAnalysis } from "@/lib/demo/data";

beforeEach(() => {
  process.env.NEAR_AI_API_KEY = "sk-test";
  __resetEnvForTests();
});
afterEach(() => {
  delete process.env.NEAR_AI_API_KEY;
  __resetEnvForTests();
});

describe("analyst without NEAR AI credits", () => {
  it("falls back to a labelled template answer that is never verified", async () => {
    const events: AnalystEvent[] = [];
    await runAnalyst({
      ctx: { user: null, supabase: null, demo: true, supabaseConfigured: false },
      question: "What are my biggest financial risks?",
      conversationId: null,
      clientHistory: [],
      saveHistory: false,
      emit: (e) => events.push(e),
    });
    const metas = events.filter((e) => e.type === "meta");
    const last = metas.at(-1) as Extract<AnalystEvent, { type: "meta" }>;
    expect(last.inference).toBe("demo-template");
    expect(last.notes.join(" ")).toMatch(/temporarily unavailable/i);
    const text = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("");
    expect(text).toMatch(/not produced by NEAR AI/);
    // Users never see account/billing/configuration details.
    expect(JSON.stringify(events)).not.toMatch(/credits|spending|NEAR_AI_|deployer|deployment/i);
    const v = events.find((e) => e.type === "verification") as Extract<AnalystEvent, { type: "verification" }>;
    expect(v.result.state).toBe("not-connected");
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(events.at(-1)?.type).toBe("done");
  });
});

describe("templateAnswer", () => {
  it("labels the data scope and never claims to be NEAR AI", () => {
    const demo = templateAnswer("Analyse my portfolio", { portfolio: demoPortfolio(), risk: demoRiskAnalysis(), reason: "r" });
    expect(demo).toContain("sample data");
    expect(demo).toMatch(/not produced by NEAR AI/);
    const live = templateAnswer("Analyse my portfolio", {
      portfolio: { ...demoPortfolio(), provenance: { ...demoPortfolio().provenance, mode: "live" } },
      risk: null,
      reason: "r",
    });
    expect(live).toContain("your live data");
  });
  it("handles an empty portfolio", () => {
    const p = demoPortfolio();
    expect(templateAnswer("risks?", { portfolio: { ...p, holdings: [], allocation: [] }, risk: null, reason: "r" })).toMatch(/No portfolio data/);
  });
});
