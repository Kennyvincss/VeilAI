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

VEIL AI never signs, sends or requests transactions. If transaction features are added later, they must require explicit per-transaction user approval in the wallet.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository.
