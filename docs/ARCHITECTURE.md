# Architecture

## Stack

Next.js 16 (App Router, Turbopack, `proxy.ts`), React 19, TypeScript, Tailwind CSS v4, Framer Motion, Lucide, Recharts, Supabase (`@supabase/ssr`), NEAR AI Cloud, NEAR Connect, `@phala/dcap-qvl` (pure JS), `near-api-js`, `@noble/*` crypto, ethers v6, jsPDF, Vitest. Deploys to Vercel.

## Directory layout

```
app/
  page.tsx                     landing page
  login/, signup/              Supabase email (+ optional Google) auth
  auth/callback, auth/signout  PKCE code exchange, sign-out
  demo/, demo/exit             start/stop a no-account demo session (cookie)
  proof/[token]                public, content-free proof of a verified AI answer
  manifest.ts                  installable web app manifest
  dashboard/                   overview, wallet (DeFi), analyst, wallet-intelligence,
                               risk-engine, privacy, reports, memory
  api/
    ai/chat                    NDJSON streaming analyst
    ai/conversations[/id]      list / load / delete conversations
    portfolio, risk, activity  live (or demo) portfolio, risk and transactions
    wallet/tracked|challenge|verify|intelligence
    privacy/attestation|models|history
    preferences, reports[/id]
    defi/overview|send|stake|history   prepare (never sign) send/stake plans; activity
    contacts                   encrypted address book (signed-in users)
    defi/pulse                 balance fingerprint for notifications
    near-account[/check|create]   free name.near creation (sponsored, non-custodial)
    proof/attest               fresh attestation for a VEIL-issued proof
    defi/swap/tokens|quote|status|submit   NEAR Intents 1Click
components/                    ui, layout, landing, dashboard, analyst, wallet, privacy, charts
hooks/                         use-api, use-analyst-stream, use-near-wallet
lib/
  env.ts                       zod-validated env + feature flags + startup report
  session.ts                   request context (user | demo)
  near-ai/                     client, e2ee, checks (pure), hardware (TDX/GPU), verify (orchestrator)
  near/                        account validation, RPC, NEP-413, challenge constants
  defi/                        exact amounts, transaction builders, 1Click client, prepare service,
                               receiver safety check, activity describer
  ai/actions.ts                wallet actions parsed from the user's own chat message
  near-ai/proof.ts             HMAC-signed, content-free proof tokens
  blockchain/                  http helper + source tracking, FastNEAR, NearBlocks, prices (1Click, CoinGecko)
  portfolio/                   compute (pure), service (live), resolve
  wallet-intel/                analyze (pure), service (live), known contracts & risk lists
  risk/                        engine (pure), service (live inputs)
  ai/                          prompts, context (minimisation), analyst (pipeline)
  security/                    validation, rate-limit, prompt-guard, crypto, logger, http
  supabase/                    server/browser/proxy clients, repo (data access)
  reports/                     build (pure), pdf (browser)
  demo/                        sample dataset + template answers
supabase/migrations/           schema + RLS policies
tests/                         unit + integration (Vitest)
```

## Design principles

1. **Pure core, thin I/O.** Every calculation (portfolio maths, risk scores, wallet heuristics, attestation checks, NEP-413, E2EE) is a pure function with unit tests. Network code sits in thin `service`/`client` modules.
2. **Provenance everywhere.** Every payload carries `provenance: { mode: "live" | "demo", sources[], notes[] }`. The UI renders a LIVE/DEMO badge and source chips next to data.
3. **Honest failure.** A failed provider yields missing values plus a note. It is never replaced with made-up numbers. Verification failures surface as FAILED or UNVERIFIED with reasons.
4. **Least privilege.** User queries run under RLS with the anon key. Secrets are server-only. The wallet integration requests no function-call keys; transactions are only requested from the Wallet page after an in-app review, and the user's wallet signs each one.

## Modes

| Situation | Behaviour |
|---|---|
| Supabase not configured | Whole dashboard is a demo; auth pages explain how to configure. |
| Visitor not signed in, clicked "Explore demo" | `veil_demo` cookie, sample data, nothing persisted. |
| Signed in, no wallets | Live mode with empty states prompting to add a wallet. |
| NEAR AI not configured | Analyst returns template answers labelled "Demo response — not NEAR AI"; Privacy Centre shows NOT CONNECTED / UNVERIFIED. |
| NEAR AI configured, demo visitor | Live NEAR AI inference on **sample** data (if `DEMO_ALLOW_LIVE_AI` is not `false`), rate-limited per IP. |

### Demo mode

`lib/demo/data.ts` holds fictional balances and round-number prices, labelled "SAMPLE DATA". Risk scores and wallet indicators for the demo are computed by the **real** engine over this sample data, so the demo shows real behaviour without presenting fiction as fact.

## Analyst pipeline (`lib/ai/analyst.ts`)

`initialising` → load the minimal data the question needs (intent detection) → build pseudonymised, sanitised context → (E2EE) attest and encrypt → `processing` (stream tokens) → `verifying` (signature + fresh attestation) → persist if allowed → `done`. Each step is an NDJSON event consumed by `hooks/use-analyst-stream.ts`.

## Data model

See `supabase/migrations/20261104000000_init.sql`: `tracked_wallets`, `conversations`, `messages`, `preferences`, `processing_log`, `reports`. All have owner-only RLS policies. A trigger keeps `conversations.updated_at` current, and another trims `processing_log` to 500 rows per user.

## Performance

- Charts and NEAR Connect are client-only and code-split per route. NEAR Connect and jsPDF are dynamically imported on first use.
- Provider calls use Next's data cache (`revalidate`) where data is shareable (token lists, prices, metadata), and in-memory caches for FT metadata, the Intents token list and attested E2EE keys.
- Portfolio fetches run in parallel per wallet, with caps (30 tokens and 8 staking pools per wallet, 6 price histories, 3 activity wallets).
- AI insights on the dashboard are generated on demand, not on every page load.
