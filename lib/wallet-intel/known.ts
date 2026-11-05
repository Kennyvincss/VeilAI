/**
 * Labels for well-known public NEAR protocol contracts. These are public
 * infrastructure (not individuals), so they are kept readable in AI
 * context while other counterparties are pseudonymised.
 */
export const KNOWN_CONTRACTS: Record<string, string> = {
  "wrap.near": "Wrapped NEAR (wNEAR)",
  "v2.ref-finance.near": "Ref Finance DEX",
  "ref-finance.near": "Ref Finance",
  "intents.near": "NEAR Intents (Verifier)",
  "usdt.tether-token.near": "Tether USDt",
  "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": "Native USDC",
  "meta-pool.near": "Meta Pool (stNEAR)",
  "linear-protocol.near": "LiNEAR Protocol",
  "contract.main.burrow.near": "Burrow lending",
  "token.burrow.near": "BRRR token",
  "aurora": "Aurora (EVM)",
  "relay.aurora": "Aurora relayer",
  "token.sweat": "SWEAT token",
  "game.hot.tg": "HOT",
  "dclv2.ref-labs.near": "Ref DCL",
  "app.nearcrowd.near": "NEARCrowd",
  "social.near": "NEAR Social",
  "lockup.near": "NEAR lockup factory",
  "near": "NEAR registrar",
};

/**
 * Published risk lists.
 *
 * VEIL AI ships with NO hard-coded "malicious" addresses: labelling a wallet
 * requires a reliable, citable source. Operators can supply entries via the
 * RISK_LIST_JSON environment variable as
 *   [{"account":"x.near","reason":"...","source":"https://..."}]
 * Every entry must carry a source that the UI displays as evidence.
 */
interface RiskEntry {
  account: string;
  reason: string;
  source: string;
}

let parsed: Map<string, RiskEntry> | null = null;

function riskList(): Map<string, RiskEntry> {
  if (parsed) return parsed;
  parsed = new Map();
  const raw = typeof process !== "undefined" ? process.env.RISK_LIST_JSON : undefined;
  if (raw) {
    try {
      const arr = JSON.parse(raw) as RiskEntry[];
      for (const e of arr) {
        if (e && typeof e.account === "string" && typeof e.source === "string" && /^https?:\/\//.test(e.source)) {
          parsed.set(e.account.toLowerCase(), { account: e.account.toLowerCase(), reason: String(e.reason ?? "listed"), source: e.source });
        }
      }
    } catch {
      /* ignore malformed list */
    }
  }
  return parsed;
}

export function lookupRiskList(account: string): { source: string; reason: string } | null {
  const e = riskList().get(account.toLowerCase());
  return e ? { source: e.source, reason: e.reason } : null;
}

export function riskListSize(): number {
  return riskList().size;
}

export function __resetRiskListForTests() {
  parsed = null;
}
