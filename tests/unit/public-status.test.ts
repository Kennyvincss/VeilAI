import { afterEach, describe, expect, it } from "vitest";
import { __resetEnvForTests, getPublicStatus } from "@/lib/env";

afterEach(() => {
  for (const k of ["NEAR_AI_API_KEY", "DATA_ENCRYPTION_KEY", "NEXT_PUBLIC_GOOGLE_AUTH_ENABLED", "NEAR_AI_BASE_URL"]) delete process.env[k];
  __resetEnvForTests();
});

describe("public status sent to browsers", () => {
  it("contains only the allowed, non-sensitive fields", () => {
    process.env.NEAR_AI_API_KEY = "sk-secret-value";
    process.env.DATA_ENCRYPTION_KEY = "00".repeat(32);
    process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED = "true";
    process.env.NEAR_AI_BASE_URL = "https://internal-gateway.example";
    __resetEnvForTests();
    const s = getPublicStatus();
    expect(Object.keys(s).sort()).toEqual(["accounts", "nearAi", "network"]);
    expect(Object.keys(s.nearAi).sort()).toEqual(["configured", "e2ee", "model"]);
    expect(JSON.stringify(s)).not.toMatch(/sk-secret|internal-gateway|baseUrl|dataEncryption|googleAuth|demoAllowsLiveAi|e2eeMode|providers/);
  });
});
