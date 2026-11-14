import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { networkApr } from "@/lib/defi/service";

const NEAR = BigInt(10) ** BigInt(24);

describe("estimated staking reward", () => {
  it("is inflation × validators' share × supply ÷ stake", () => {
    // 2.5% inflation, no treasury cut, 1.3B supply, 650M staked → 5%
    expect(networkApr({ inflation: 0.025, treasuryShare: 0, totalSupplyYocto: BigInt(1_300_000_000) * NEAR }, BigInt(650_000_000) * NEAR)).toBe(5);
    // a 10% treasury cut lowers it to 4.5%
    expect(networkApr({ inflation: 0.025, treasuryShare: 0.1, totalSupplyYocto: BigInt(1_300_000_000) * NEAR }, BigInt(650_000_000) * NEAR)).toBe(4.5);
  });
  it("returns null instead of a made-up number when stake is unknown", () => {
    expect(networkApr({ inflation: 0.025, treasuryShare: 0, totalSupplyYocto: BigInt(1) * NEAR }, BigInt(0))).toBeNull();
  });
});
