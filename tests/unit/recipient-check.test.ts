import { describe, expect, it } from "vitest";
import type { NormalizedTx } from "@/types";
import { analyzeRecipient, levenshtein, lookalikeOf, type RecipientFacts } from "@/lib/defi/recipient-check";

const NOW = Date.parse("2026-11-10T00:00:00Z");
const tx = (signer: string, receiver: string, daysAgo: number, over: Partial<NormalizedTx> = {}): NormalizedTx => ({
  hash: `h${signer}${receiver}${daysAgo}`,
  timestamp: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  signer,
  receiver,
  direction: "out",
  actions: [{ kind: "TRANSFER", depositNear: 1 }],
  depositNear: 1,
  feeNear: 0,
  success: true,
  ...over,
});
const base = (over: Partial<RecipientFacts> = {}): RecipientFacts => ({
  from: "me.near",
  to: "friend.near",
  tokenContract: null,
  receiverIsContract: false,
  receiverBalanceNear: 10,
  receiverTxs: [tx("x.near", "friend.near", 400)],
  receiverFts: [],
  sampleSize: 25,
  senderTxs: [tx("me.near", "friend.near", 10)],
  knownTokenContracts: ["usdt.tether-token.near", "wrap.near"],
  now: NOW,
  ...over,
});

describe("look-alike detection", () => {
  it("measures edit distance", () => {
    expect(levenshtein("alice.near", "alice.near")).toBe(0);
    expect(levenshtein("alice.near", "a1ice.near")).toBe(1);
    expect(levenshtein("alice.near", "alicee.near")).toBe(1);
  });
  it("flags near-identical named accounts and address poisoning", () => {
    expect(lookalikeOf("a1ice.near", ["alice.near"])).toBe("alice.near");
    expect(lookalikeOf("totally.near", ["alice.near"])).toBeNull();
    const real = "abcdef" + "1".repeat(52) + "123456";
    const fake = "abcdef" + "2".repeat(52) + "123456";
    expect(lookalikeOf(fake, [real])).toBe(real);
    expect(lookalikeOf(real, [real])).toBeNull();
  });
});

describe("analyzeRecipient", () => {
  it("is ok for an established account the user has paid before", () => {
    const r = analyzeRecipient(base());
    expect(r.level).toBe("ok");
    expect(r.findings.map((f) => f.id)).toEqual(["sent-before"]);
  });
  it("flags a look-alike of a past recipient as danger", () => {
    const r = analyzeRecipient(base({ to: "fr1end.near" }));
    expect(r.level).toBe("danger");
    expect(r.findings[0]).toMatchObject({ id: "lookalike" });
    expect(r.findings[0].detail).toContain("friend.near");
  });
  it("flags very new accounts and empty histories", () => {
    expect(analyzeRecipient(base({ to: "new.near", receiverTxs: [tx("a.near", "new.near", 2)] })).findings.map((f) => f.id)).toContain("new-account");
    // A full sample doesn't reveal the true first activity, so no age claim.
    const full = Array.from({ length: 25 }, () => tx("a.near", "busy.near", 1));
    expect(analyzeRecipient(base({ to: "busy.near", receiverTxs: full })).findings.map((f) => f.id)).not.toContain("new-account");
    expect(analyzeRecipient(base({ to: "empty.near", receiverTxs: [] })).level).toBe("caution");
  });
  it("flags token and contract receivers", () => {
    expect(analyzeRecipient(base({ to: "usdt.tether-token.near", tokenContract: "usdt.tether-token.near", receiverIsContract: true })).findings[0].id).toBe("token-to-own-contract");
    expect(analyzeRecipient(base({ to: "wrap.near", receiverIsContract: true })).findings[0].id).toBe("to-token-contract");
    expect(analyzeRecipient(base({ to: "some-dao.near", receiverIsContract: true })).findings[0]).toMatchObject({ id: "contract", severity: "caution" });
  });
  it("uses the address book: exact match is reassuring, a look-alike is danger", () => {
    expect(analyzeRecipient(base({ to: "alice.near", senderTxs: [], contacts: ["alice.near"] })).findings.map((f) => f.id)).toContain("saved-contact");
    const r = analyzeRecipient(base({ to: "a1ice.near", senderTxs: [], contacts: ["alice.near"] }));
    expect(r.level).toBe("danger");
    expect(r.findings[0].detail).toContain("(a saved contact)");
  });
  it("says so when history is unavailable instead of claiming it's safe", () => {
    const r = analyzeRecipient(base({ receiverTxs: null, senderTxs: null }));
    expect(r.level).toBe("unknown");
    expect(r.findings.map((f) => f.id)).toEqual(["history-unavailable"]);
  });
});
