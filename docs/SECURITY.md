# Security

## Threat model (summary)

| Threat | Mitigation |
|---|---|
| Credential leakage | All secrets are server-side env vars (`lib/env.ts`, `server-only` imports). Only boolean feature flags reach the client (`/api/status`). No service-role key is used at runtime. |
| Seed phrase / private key collection | Never requested. `looksLikeSecret()` (BIP-39 wordlist, NEAR/EVM key formats) rejects pasted secrets client-side **and** in API validation, before anything is sent or logged. |
| Unauthorised data access | Supabase RLS on every table. Server queries run as the user (anon key + session) and also filter by `user_id`. `getUser()` revalidates tokens with Supabase Auth. |
| CSRF | All state-changing routes require a same-origin `Origin`/`Referer` (`assertSameOrigin`). Session cookies are SameSite=Lax, and the NEP-413 challenge cookie is SameSite=Strict, httpOnly and path-scoped. |
| Abuse / cost exhaustion | Per-user and per-IP sliding-window rate limits (`lib/security/rate-limit.ts`): AI 20/10 min (signed-in), 6/10 min (anonymous), attestation 6/5 min, etc. Body-size caps on every JSON route. |
| Prompt injection | Untrusted chain/market strings are sanitised (control/bidi chars, delimiter and chat-template tokens removed, length-capped) and wrapped in `<data>` blocks that the system prompt marks as inert. Jailbreak phrasing in user input triggers a reminder. Wallet-report context is sent as a structured, server-sanitised attachment, not concatenated into the user's text. |
| XSS via model output | Markdown is rendered with `react-markdown` with `skipHtml`. Images are dropped and only `http(s)` links are allowed (`rel="noopener noreferrer nofollow"`). |
| Fake verification | VERIFIED requires every required cryptographic check to pass (`allRequiredPass`). Missing evidence gives UNVERIFIED. Integration tests assert this for replayed nonces, bad quotes, failed GPU verdicts, tampered hashes, wrong signers and missing attestations. |
| Replay of attestation / signatures | A fresh 32-byte nonce per verification must appear in TDX `report_data` and the GPU evidence. NEP-413 challenges are single-use and expire in 5 minutes. |
| E2EE to a malicious key | VEIL AI only encrypts to an Ed25519 key that equals the attested signing address of an enclave verified with a fresh nonce. |
| Open redirects | `/auth/callback` only accepts same-site relative `next` paths. |
| Clickjacking / content injection | CSP, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, HSTS, strict Referrer-Policy and Permissions-Policy (`next.config.ts`). |
| Sensitive data in logs | Structured logger redacts secret/content keys and fingerprints account IDs. |
| Data at rest | AES-256-GCM application encryption (random IV, auth tag) for messages, conversation titles, goals and saved reports when `DATA_ENCRYPTION_KEY` is set. |

## CSP notes

NEAR Connect runs wallet executors in sandboxed `srcdoc` iframes that inherit the page CSP, so `script-src` includes `'unsafe-inline' https:` and `frame-src https:`. Everything else is locked down (`object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`).

## Rate limiting in production

The limiter is in-memory per server instance, which bounds abuse per warm Vercel instance. For strict global limits, replace `rateLimit()` with a shared store (e.g. Upstash Redis). The function signature is intentionally small.

## Wallet heuristics

Wallet indicators are **heuristics with cited evidence**, never verdicts:

- `risk-list-interaction`: only from operator-supplied lists where **every entry has an http(s) source** (`RISK_LIST_JSON`). VEIL AI ships with no hard-coded "malicious" addresses.
- `failed-ratio`: 20% or more of ≥10 sampled transactions failed.
- `activity-burst`: a day with ≥10 transactions and ≥5× the median active day.
- `drain-pattern`: the largest outflow is ≥100 NEAR and more than 5× the remaining balance.
- `airdrop-spam`: ≥5 distinct tokens minted to the account (phishing-lure pattern).
- `key-changes`: `ADD_KEY` actions in the sample.

## Transactions

VEIL AI never holds keys and never signs or sends anything on its own. The Wallet page (send, swap, stake) works like this:

1. **Server-side preparation** (`lib/defi/service.ts`): inputs are validated with zod; amounts are converted to base units with exact integer maths (no floating point); balances, storage registration (NEP-145), receiver existence and staking-pool validity are checked against the chain. The server returns a plan: the exact transactions plus plain-language review rows and warnings.
2. **In-app review** (`components/wallet/review-dialog.tsx`): the user sees what will happen and can expand the exact transactions.
3. **Wallet approval**: the plan is passed to the user's wallet through NEAR Connect. The wallet shows its own confirmation and signs. Cancelling at any point sends nothing.

Swap quotes from NEAR Intents are checked before a plan is built: the quote's `recipient` and `refundTo` must equal the user's account, `originAsset`/`destinationAsset` must be the tokens the user chose, `amountIn` must equal the requested amount, slippage must not be looser than chosen, and the deposit address must be a valid NEAR account — otherwise the quote is discarded. Staking, unstaking and withdrawals only target accounts created by the official staking-pool factories (`*.poolv1.near`, `*.pool.near`, testnet `*.pool.f863973.m0`).

### Receiver safety check

Before a send is shown for review, `lib/defi/recipient-check.ts` analyses the receiver using public data (NearBlocks samples, the NEAR Intents token list, the configured risk list, and the user's address book). Findings cite their evidence and are heuristics, not verdicts:

| Finding | Severity |
|---|---|
| Receiver on a sourced risk list (`RISK_LIST_JSON`) | danger |
| Sending a token to its own contract, or to any token contract | danger |
| Look-alike of a saved contact, a past recipient or a known protocol account (edit distance ≤ 2; for 64-hex implicit accounts, same first and last 6 characters — address poisoning) | danger |
| Smart-contract receiver | caution |
| Account with no history, or first activity < 7 days ago (only when the sample is complete) | caution |
| Wallet-intelligence indicators on the receiver (drain pattern, airdrop spam, failed ratio…) | caution/info |
| First time sending / sent before / saved contact | info |

A "danger" finding requires the user to tick an acknowledgement before "Approve in wallet" is enabled; nothing is ever blocked silently. If history can't be fetched in ~6 s the check says so ("limited") instead of claiming the receiver is safe.

### Actions from chat

The analyst detects wallet actions only in the **user's own message** (`lib/ai/actions.ts`), never in model output, so a prompt-injected answer can't propose a transfer. A detected action shows a card that uses the same server preparation, review dialog and wallet approval as the Wallet page. Token symbols are resolved only when unambiguous (scam tokens often copy symbols). The model is told an action card exists and must not claim it was executed.

### Shareable proofs

`lib/near-ai/proof.ts` issues proof tokens **only from verification results the server itself just produced** — never from browser input. Tokens are `deflate(JSON)` + HMAC-SHA256 (domain-separated, `APP_SECRET`), capped at 8 KB with a 64 KB inflate limit, and contain no question or answer text. The proof page re-verifies the enclave signature on every load; `/api/proof/attest` (rate-limited, VEIL-issued tokens only) runs a fresh nonce-bound attestation of the signing key. The server never signs, holds funds or has function-call keys. POST routes require a same-origin request and are rate-limited.

## Usernames and username sign-in

- Usernames (`profiles` table) are 3–20 chars `[a-z0-9_]`, unique, with a reserved list (admin, support, near, veil, …) enforced in the database as well as the app.
- **Receiving at @username** requires linking a wallet the user proved they own (NEP-413). A database trigger rejects any `payout_account` that isn't an ownership-verified tracked wallet of the same user, and unlinks it if the wallet is removed. Senders resolve `@username` server-side via a `security definer` function that returns only `username → account` for linked profiles; the review screen shows "@alice → account" and the safety check explains the link.
- **Username sign-in** (`/api/auth/login`): the server maps the username to its email with a function granted **only to `service_role`**, then Supabase verifies the password and sets the session cookies. The email never reaches the browser. Errors are uniform ("Incorrect username or password"), same-origin is required, and attempts are rate-limited per IP and per username. `SUPABASE_SERVICE_ROLE_KEY` is used for nothing else; without it, username sign-in is disabled and email sign-in still works.

## Notifications

Created in the browser and stored in `localStorage` only. While the dashboard is open and a wallet is connected, the page polls a cheap balance fingerprint (`/api/defi/pulse`, RPC + FastNEAR) every 45 s and only fetches activity when it changes. Browser alerts use the Notification API after the user grants permission. Nothing is tracked server-side or in the background.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository.
