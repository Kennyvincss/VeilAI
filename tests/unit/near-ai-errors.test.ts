import { describe, expect, it } from "vitest";
import { explainNearAiError, NearAiError, nearAiOperatorHint } from "@/lib/near-ai/client";

const LEAKS = /NEAR_AI_|SUPABASE|deployer|deployment|credits|spending|api key|cloud\.near\.ai|responded \d{3}/i;

const cases: [string, NearAiError][] = [
  ["no credits", new NearAiError("NEAR AI Cloud responded 402: No spending limit configured.", 402)],
  ["bad key", new NearAiError("NEAR AI Cloud responded 401: invalid key", 401)],
  ["retired model", new NearAiError("NEAR AI Cloud responded 400: Model 'deepseek-ai/DeepSeek-V3.1' not found. It's not a valid model name or alias.", 400)],
  ["not configured", new NearAiError("NEAR AI Cloud is not configured (NEAR_AI_API_KEY missing).", undefined, "not_configured")],
  ["rate limited", new NearAiError("NEAR AI Cloud responded 429", 429)],
  ["outage", new NearAiError("Could not reach NEAR AI Cloud", undefined, "network")],
];

describe("user-facing NEAR AI errors never reveal configuration or account details", () => {
  it.each(cases)("%s", (_name, err) => {
    const msg = explainNearAiError(err);
    expect(msg.length).toBeGreaterThan(10);
    expect(msg).not.toMatch(LEAKS);
  });
  it("gives users actionable wording for transient problems", () => {
    expect(explainNearAiError(cases[4][1])).toMatch(/busy/);
    expect(explainNearAiError(cases[5][1])).toMatch(/could not be reached/);
    expect(explainNearAiError(new Error("boom"))).not.toContain("boom");
  });
});

describe("operator hints (server logs only) keep the diagnosis", () => {
  it("names the fix for each failure", () => {
    expect(nearAiOperatorHint(cases[0][1])).toMatch(/credits/);
    expect(nearAiOperatorHint(cases[1][1])).toMatch(/NEAR_AI_API_KEY/);
    expect(nearAiOperatorHint(cases[2][1])).toMatch(/NEAR_AI_MODEL/);
    expect(nearAiOperatorHint(cases[3][1])).toMatch(/NEAR_AI_API_KEY/);
  });
});
