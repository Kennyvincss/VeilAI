import { beforeEach, describe, expect, it, vi } from "vitest";

/** TDX quote verification maps dcap-qvl results conservatively. */
const lib = { verify: vi.fn(), getCollateralFromPcs: vi.fn(async () => ({})) };
vi.mock("@phala/dcap-qvl", () => lib);

import { verifyTdxQuote } from "@/lib/near-ai/hardware";

const td = { reportData: new Uint8Array([0xab, 0xcd]), mrConfigId: new Uint8Array([0x01]) };
const report = (status: string, isTd = true) => ({ status, report: { asTd10: () => (isTd ? td : null), asTd15: () => null, asTd15Ex: () => null } });

beforeEach(() => lib.verify.mockReset());

describe("verifyTdxQuote", () => {
  it("passes UpToDate and exposes report data and mr_config", async () => {
    lib.verify.mockReturnValue(report("UpToDate"));
    const r = await verifyTdxQuote("00");
    expect(r).toMatchObject({ verified: true, reportDataHex: "abcd", mrConfigHex: "01", check: { status: "pass" } });
  });
  it("accepts OutOfDate only as a warning", async () => {
    lib.verify.mockReturnValue(report("OutOfDate"));
    expect((await verifyTdxQuote("00")).check.status).toBe("warn");
  });
  it("fails revoked or unknown TCB and non-TDX quotes", async () => {
    lib.verify.mockReturnValue(report("Revoked"));
    expect((await verifyTdxQuote("00")).verified).toBe(false);
    lib.verify.mockReturnValue(report("UpToDate", false));
    expect((await verifyTdxQuote("00")).verified).toBe(false);
  });
  it("fails closed when the library rejects the quote (e.g. forged QE identity)", async () => {
    lib.getCollateralFromPcs.mockRejectedValueOnce(new Error("Signature is invalid for qe_identity"));
    const r = await verifyTdxQuote("00");
    expect(r).toMatchObject({ verified: false, check: { status: "fail" } });
    expect(r.check.detail).toMatch(/qe_identity/);
  });
});
