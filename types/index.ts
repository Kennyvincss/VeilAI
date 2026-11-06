/**
 * Shared domain types for VEIL AI.
 *
 * Every data payload that reaches the UI carries a `provenance` describing
 * whether it is LIVE (fetched from a real provider) or DEMO (bundled sample
 * data). The UI must never render demo data without a visible label.
 */

export type DataMode = "live" | "demo";

export interface DataSource {
  /** Human readable provider name, e.g. "NEAR RPC (FastNEAR)". */
  name: string;
  /** Public documentation / endpoint base for transparency. */
  url: string;
  /** What this source contributed. */
  purpose: string;
  /** ISO timestamp of retrieval. */
  fetchedAt: string;
  ok: boolean;
  error?: string;
}

export interface Provenance {
  mode: DataMode;
  sources: DataSource[];
  generatedAt: string;
  /** Caveats the UI must display alongside the data. */
  notes: string[];
}

export interface TokenHolding {
  /** Contract account (NEP-141) or "near" for the native token. */
  contractId: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Raw balance in smallest units (string to preserve precision). */
  rawBalance: string;
  /** Human balance. */
  amount: number;
  priceUsd: number | null;
  valueUsd: number | null;
  change24hPct: number | null;
  /** Whether the asset is routable through NEAR Intents (1Click token list). */
  intentsRoutable: boolean;
  isStablecoin: boolean;
  coingeckoId?: string;
  icon?: string | null;
  /** Wallet(s) holding this asset. */
  wallets: string[];
}

export interface WalletBalanceSummary {
  accountId: string;
  label?: string | null;
  nativeNear: number;
  stakedNear: number | null;
  storageUsage: number | null;
  valueUsd: number | null;
  tokenCount: number;
  ok: boolean;
  error?: string;
}

export interface PortfolioSnapshot {
  provenance: Provenance;
  totalValueUsd: number;
  /** Value-weighted 24h change of priced assets, in percent. */
  change24hPct: number | null;
  change24hUsd: number | null;
  holdings: TokenHolding[];
  wallets: WalletBalanceSummary[];
  allocation: { symbol: string; valueUsd: number; pct: number }[];
  unpricedAssets: number;
}

export type TxDirection = "in" | "out" | "self" | "other";

export interface NormalizedTx {
  hash: string;
  timestamp: string; // ISO
  signer: string;
  receiver: string;
  direction: TxDirection;
  actions: { kind: string; method?: string | null; depositNear: number }[];
  depositNear: number;
  feeNear: number;
  success: boolean | null;
  blockHeight?: number;
}

export interface NormalizedFtTransfer {
  hash: string;
  timestamp: string;
  contractId: string;
  symbol: string;
  decimals: number;
  /** Signed amount from the subject account's perspective. */
  delta: number;
  counterparty: string | null;
  cause: string;
}

export interface RiskIndicator {
  id: string;
  severity: "info" | "low" | "medium" | "high";
  title: string;
  /** On-chain facts that triggered the indicator. */
  evidence: string[];
  /** Always true: indicators are heuristics, not verdicts. */
  heuristic: true;
}

export interface WalletIntelReport {
  provenance: Provenance;
  accountId: string;
  overview: {
    exists: boolean;
    nativeNear: number | null;
    storageUsage: number | null;
    isContract: boolean;
    accountType: "named" | "implicit" | "eth-implicit";
    firstSeen: string | null;
    lastSeen: string | null;
    tokenCount: number | null;
  };
  stats: {
    sampledTransactions: number;
    sampledFtTransfers: number;
    totalTransactionsIndexed: number | null;
    failedTransactions: number;
    txPerDay: number | null;
    activeDays: number;
    nearIn: number;
    nearOut: number;
    uniqueCounterparties: number;
    sampleWindowDays: number | null;
  };
  timeline: { date: string; count: number; nearVolume: number }[];
  topCounterparties: { account: string; interactions: number; isContract: boolean | null }[];
  contractInteractions: { contract: string; methods: string[]; calls: number }[];
  largeTransfers: {
    hash: string;
    timestamp: string;
    direction: TxDirection;
    amount: number;
    asset: string;
    counterparty: string;
  }[];
  riskIndicators: RiskIndicator[];
  recentTransactions: NormalizedTx[];
  ftTransfers: NormalizedFtTransfer[];
}

export interface RiskCategoryResult {
  id:
    | "concentration"
    | "volatility"
    | "liquidity"
    | "exposure"
    | "performance"
    | "activity"
    | "suspicious";
  label: string;
  /** 0 (low risk) – 100 (high risk); null when data was insufficient. */
  score: number | null;
  weight: number;
  explanation: string;
  /** The exact inputs used, for transparency. */
  inputs: Record<string, string | number | null>;
  precautions: string[];
}

export interface RiskAnalysis {
  provenance: Provenance;
  overallScore: number | null;
  level: "low" | "moderate" | "elevated" | "high" | "insufficient-data";
  categories: RiskCategoryResult[];
  methodology: string[];
  disclaimer: string;
}

/* ---------------- NEAR AI / attestation ---------------- */

export type CheckStatus = "pass" | "fail" | "skipped" | "warn";

export interface VerificationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  /** Required checks must pass for the overall result to be VERIFIED. */
  required: boolean;
  detail?: string;
  expected?: string;
  actual?: string;
}

export type VerificationState =
  | "not-connected"
  | "initialising"
  | "processing"
  | "verifying"
  | "verified"
  | "failed"
  | "unverified";

export interface AttestationTarget {
  kind: "gateway" | "model";
  signingAddress: string | null;
  signingAlgo: string;
  checks: VerificationCheck[];
  composeHash?: string | null;
  mrConfig?: string | null;
  tdxStatus?: string | null;
  gpuVerdict?: string | null;
  imageDigests?: string[];
  verified: boolean;
}

export interface VerificationResult {
  state: VerificationState;
  model: string;
  nonce: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  targets: AttestationTarget[];
  /** Checks over the specific chat completion (signature/hash binding). */
  completionChecks: VerificationCheck[];
  chatId?: string | null;
  e2ee: {
    enabled: boolean;
    algo?: string;
    version?: string;
    modelKeyAttested?: boolean;
    reason?: string;
  };
  summary: string;
  errors: string[];
}

export interface AppStatus {
  nearAi: {
    configured: boolean;
    baseUrl: string;
    model: string;
    e2eeMode: "required" | "preferred" | "off";
  };
  supabase: { configured: boolean };
  dataEncryption: { configured: boolean };
  googleAuth: boolean;
  network: "mainnet" | "testnet";
  demoAllowsLiveAi: boolean;
}

export interface FinancialPreferences {
  timeframe: "short" | "medium" | "long" | null;
  riskTolerance: "conservative" | "balanced" | "aggressive" | null;
  ecosystems: string[];
  watchlist: string[];
  goals: string | null;
  useInAi: boolean;
  saveChatHistory: boolean;
  updatedAt?: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  meta?: {
    mode?: DataMode;
    model?: string;
    verification?: VerificationResult | null;
    sources?: DataSource[];
    e2ee?: boolean;
    demoReason?: string;
  };
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type ReportType = "portfolio" | "risk" | "wallet" | "ai-summary";

export interface FinancialReport {
  id?: string;
  type: ReportType;
  title: string;
  generatedAt: string;
  mode: DataMode;
  subject: string;
  sections: { heading: string; body?: string; table?: { columns: string[]; rows: (string | number)[][] } }[];
  sources: DataSource[];
  methodology: string[];
  disclaimer: string;
  verification?: VerificationResult | null;
}
