import { afterEach, describe, expect, it } from "vitest";
import { __resetEnvForTests, getEnv } from "@/lib/env";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  __resetEnvForTests();
});

describe("environment parsing", () => {
  it("ignores only an invalid setting and keeps the rest", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "abcd1234.supabase.co"; // missing https://
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.NEAR_AI_API_KEY = "key";
    __resetEnvForTests();
    const env = getEnv();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(env.NEAR_AI_API_KEY).toBe("key");
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("anon");
  });
});
