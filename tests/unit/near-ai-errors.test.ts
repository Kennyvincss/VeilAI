import { describe, expect, it } from "vitest";
import { explainNearAiError, NearAiError } from "@/lib/near-ai/client";

describe("explainNearAiError", () => {
  it("explains missing credits (HTTP 402)", () => {
    expect(explainNearAiError(new NearAiError("NEAR AI Cloud responded 402: No spending limit configured.", 402))).toMatch(/credits or spending limit.*cloud\.near\.ai/);
  });
  it("explains bad keys", () => {
    expect(explainNearAiError(new NearAiError("x", 401))).toMatch(/NEAR_AI_API_KEY/);
  });
  it("explains a retired or unknown model", () => {
    const m = explainNearAiError(new NearAiError("NEAR AI Cloud responded 400: Model 'deepseek-ai/DeepSeek-V3.1' not found. It's not a valid model name or alias.", 400));
    expect(m).toContain("DeepSeek-V3.1");
    expect(m).toMatch(/NEAR_AI_MODEL/);
  });
  it("handles missing configuration, rate limits and outages", () => {
    expect(explainNearAiError(new NearAiError("x", undefined, "not_configured"))).toMatch(/not configured/);
    expect(explainNearAiError(new NearAiError("x", 429))).toMatch(/rate-limiting/);
    expect(explainNearAiError(new NearAiError("Could not reach NEAR AI Cloud", undefined, "network"))).toMatch(/temporarily unavailable/);
    expect(explainNearAiError(new Error("boom"))).toMatch(/failed/);
  });
});
