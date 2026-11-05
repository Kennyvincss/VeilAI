import { describe, expect, it } from "vitest";
import { accountKind, isValidAccountId, looksLikeSecret, matchesNetwork, normalizeAccountId } from "@/lib/near/account";
import { accountIdSchema, chatRequestSchema, preferencesSchema, ownershipProofSchema } from "@/lib/security/validation";

describe("NEAR account validation", () => {
  it.each(["alice.near", "a1", "sub.alice.near", "my_wallet-1.near", "aurora", "app.nearcrowd.near", "0x1234567890abcdef1234567890abcdef12345678", "a".repeat(64), "alice.testnet"])("accepts %s", (id) => {
    expect(isValidAccountId(id)).toBe(true);
  });

  it.each(["", "a", "Alice.near", "alice..near", ".alice.near", "alice.near.", "alice-.near", "-alice.near", "ali ce.near", "a".repeat(65), "alice@near", "alice__x.near"])("rejects %j", (id) => {
    expect(isValidAccountId(id)).toBe(false);
  });

  it("normalises case and whitespace", () => {
    expect(normalizeAccountId("  Alice.NEAR ")).toBe("alice.near");
  });

  it("classifies account kinds", () => {
    expect(accountKind("alice.near")).toBe("named");
    expect(accountKind("f".repeat(64))).toBe("implicit");
    expect(accountKind("0x" + "a".repeat(40))).toBe("eth-implicit");
  });

  it("matches network suffixes", () => {
    expect(matchesNetwork("alice.testnet", "mainnet")).toBe(false);
    expect(matchesNetwork("alice.near", "testnet")).toBe(false);
    expect(matchesNetwork("alice.near", "mainnet")).toBe(true);
    expect(matchesNetwork("f".repeat(64), "testnet")).toBe(true);
  });
});

describe("secret detection (seed phrases / private keys are never accepted)", () => {
  const mnemonic = "abandon ability able about above absent absorb abstract absurd abuse access accident";
  it("detects a BIP-39 mnemonic", () => expect(looksLikeSecret(mnemonic)).toBe(true));
  it("detects a mnemonic embedded in a sentence", () => expect(looksLikeSecret(`my words are ${mnemonic} please help`)).toBe(true));
  it("detects a NEAR ed25519 secret key", () => expect(looksLikeSecret(`ed25519:${"3".repeat(88)}`)).toBe(true));
  it("detects an EVM private key", () => expect(looksLikeSecret(`0x${"ab".repeat(32)}`)).toBe(true));
  it("does not flag normal questions", () => {
    expect(looksLikeSecret("analyse every token holding shown above and explain which ones carry the most risk")).toBe(false);
    expect(looksLikeSecret("What are my biggest financial risks?")).toBe(false);
  });
  it("does not flag implicit account IDs", () => expect(looksLikeSecret("f".repeat(64))).toBe(false));
});

describe("API request schemas", () => {
  it("accountIdSchema normalises and validates", () => {
    expect(accountIdSchema.parse(" ALICE.near")).toBe("alice.near");
    expect(accountIdSchema.safeParse("not valid!").success).toBe(false);
  });

  it("accountIdSchema rejects pasted secrets with a clear message", () => {
    const r = accountIdSchema.safeParse(`ed25519:${"4".repeat(88)}`);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/private key or seed phrase/i);
  });

  it("chatRequestSchema enforces length and rejects secrets", () => {
    expect(chatRequestSchema.safeParse({ message: "" }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: "x".repeat(4001) }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: "abandon ability able about above absent absorb abstract absurd abuse access accident" }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: "Analyse my portfolio" }).success).toBe(true);
    expect(chatRequestSchema.safeParse({ message: "hi", conversationId: "not-a-uuid" }).success).toBe(false);
  });

  it("chatRequestSchema bounds history and attachments", () => {
    const history = Array.from({ length: 13 }, () => ({ role: "user" as const, content: "x" }));
    expect(chatRequestSchema.safeParse({ message: "hi", history }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: "hi", attachment: { kind: "wallet_intel", data: { big: "x".repeat(13_000) } } }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: "hi", attachment: { kind: "other", data: {} } }).success).toBe(false);
  });

  it("preferencesSchema validates enums and limits", () => {
    const base = { timeframe: "long", riskTolerance: "balanced", ecosystems: ["NEAR"], watchlist: [], goals: null, useInAi: true, saveChatHistory: true };
    expect(preferencesSchema.safeParse(base).success).toBe(true);
    expect(preferencesSchema.safeParse({ ...base, timeframe: "forever" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...base, watchlist: Array.from({ length: 26 }, (_, i) => `T${i}`) }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...base, goals: "x".repeat(601) }).success).toBe(false);
  });

  it("ownershipProofSchema only accepts ed25519 public keys", () => {
    const ok = { accountId: "alice.near", publicKey: "ed25519:" + "5".repeat(44), signature: "a".repeat(88) };
    expect(ownershipProofSchema.safeParse(ok).success).toBe(true);
    expect(ownershipProofSchema.safeParse({ ...ok, publicKey: "secp256k1:abc" }).success).toBe(false);
  });
});
