import { afterEach, describe, expect, it } from "vitest";
import { base64 } from "@scure/base";
import { ed25519 } from "@noble/curves/ed25519.js";
import { generateSeedPhrase, parseSeedPhrase } from "near-api-js/seed-phrase";
import { creationMessage, newAccountNameProblem, topLevelFor } from "@/lib/username-rules";
import { decodeEd25519PublicKey, decodeSignature } from "@/lib/near/nep413";
import { __resetEnvForTests } from "@/lib/env";
import { sponsorConfig, sponsoredAccountsEnabled } from "@/lib/near/sponsor";
import { normalizeNameInput } from "@/components/wallet/create-near-account";

describe("new NEAR account names", () => {
  it("accepts simple names that are also valid usernames", () => {
    for (const ok of ["alice", "bob42", "jane_doe", "a1b"]) expect(newAccountNameProblem(ok)).toBeNull();
  });
  it("rejects bad, short, long and reserved names", () => {
    expect(newAccountNameProblem("ab")).toMatch(/3–20/);
    expect(newAccountNameProblem("a".repeat(21))).toMatch(/3–20/);
    for (const bad of ["Alice", "al-ice", "_alice", "alice_", "al__ice", "al.ice"]) expect(newAccountNameProblem(bad)).not.toBeNull();
    expect(newAccountNameProblem("support")).toMatch(/reserved/);
  });
  it("cleans what people type into the name field", () => {
    expect(normalizeNameInput("Kenny", "near")).toBe("kenny");
    expect(normalizeNameInput("kenny vin", "near")).toBe("kennyvin");
    expect(normalizeNameInput("kenny.near", "near")).toBe("kenny");
    expect(normalizeNameInput("kenny.testnet", "testnet")).toBe("kenny");
  });
  it("uses the right top-level account per network", () => {
    expect(topLevelFor("mainnet")).toBe("near");
    expect(topLevelFor("testnet")).toBe("testnet");
  });
});

describe("browser key generation (non-custodial)", () => {
  it("gives a 12-word phrase that restores the same key in any wallet", () => {
    const { seedPhrase, keyPair } = generateSeedPhrase();
    expect(seedPhrase.split(" ")).toHaveLength(12);
    expect(parseSeedPhrase(seedPhrase).getPublicKey().toString()).toBe(keyPair.getPublicKey().toString());
    expect(keyPair.getPublicKey().toString()).toMatch(/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/);
  });
  it("proves key possession with a signature the server can verify", () => {
    const { keyPair } = generateSeedPhrase();
    const pk = keyPair.getPublicKey().toString();
    const msg = new TextEncoder().encode(creationMessage("alice.near", pk));
    const sig = base64.encode(keyPair.sign(msg).signature);
    expect(ed25519.verify(decodeSignature(sig), msg, decodeEd25519PublicKey(pk))).toBe(true);
    // The proof is bound to the name: it doesn't verify for a different account.
    expect(ed25519.verify(decodeSignature(sig), new TextEncoder().encode(creationMessage("mallory.near", pk)), decodeEd25519PublicKey(pk))).toBe(false);
  });
});

describe("sponsor configuration", () => {
  afterEach(() => {
    for (const k of ["NEAR_SPONSOR_ACCOUNT_ID", "NEAR_SPONSOR_PRIVATE_KEY", "NEAR_SPONSOR_DEPOSIT_NEAR", "NEAR_SPONSOR_DAILY_LIMIT"]) delete process.env[k];
    __resetEnvForTests();
  });
  it("is off unless a sponsor account and ed25519 key are configured", () => {
    __resetEnvForTests();
    expect(sponsorConfig()).toBeNull();
    expect(sponsoredAccountsEnabled()).toBe(false);
  });
  it("parses deposit and daily limit with safe defaults", () => {
    process.env.NEAR_SPONSOR_ACCOUNT_ID = "veil-sponsor.near";
    process.env.NEAR_SPONSOR_PRIVATE_KEY = "ed25519:abc";
    __resetEnvForTests();
    expect(sponsorConfig()).toMatchObject({ depositNear: "0.01", depositYocto: BigInt("10000000000000000000000"), dailyLimit: 25 });
    process.env.NEAR_SPONSOR_DEPOSIT_NEAR = "not-a-number";
    __resetEnvForTests();
    expect(sponsorConfig()).toBeNull();
  });
});
