# Privacy Architecture

VEIL AI's promise is *"Your financial intelligence. Your private data. Verified by NEAR."* This document explains, without marketing language, what that does and does not mean.

## Data flow for one AI question

```
Browser ──TLS──▶ VEIL AI server (Vercel, NOT a TEE)
                  1. authenticate, validate, rate-limit
                  2. fetch public chain data (RPC / FastNEAR / NearBlocks / 1Click / CoinGecko)
                  3. minimise: pseudonymise wallets & counterparties, round amounts,
                     drop hashes / icons / precise timestamps, sanitise untrusted strings
                  4. verify the model enclave (fresh nonce) and encrypt to its key (E2EE v2)
                  │
                  └──TLS──▶ NEAR AI Cloud gateway (CPU TEE) ──▶ model enclave (Intel TDX + NVIDIA GPU TEE)
                              sees ciphertext only (E2EE)          decrypts, runs inference, signs, encrypts reply
                  ◀────────────────────────────────────────────────
                  5. decrypt reply, stream it to the browser
                  6. verify signature + request/response hashes + fresh attestation of the signer
                  7. optionally store the conversation (encrypted, RLS) and verification metadata
Browser ◀──TLS── answer + verification evidence
```

## Protection matrix

| Data | In transit | During computation | At rest | Nature |
|---|---|---|---|---|
| Questions & AI answers | TLS; **E2EE** from VEIL server to the enclave when an attested key is available | **Inside the TEE** on NEAR AI Cloud | Only if history is on: AES-256-GCM (app key) + Supabase disk encryption, RLS | Private |
| Portfolio context sent to the model | TLS; E2EE when available | Inside the TEE; wallets pseudonymised | Not stored | Private (derived from public data) |
| Preferences (AI memory) | TLS | Sent to the model only if "use in AI" is on | Supabase + RLS; goals AES-256-GCM | Private |
| Tracked-wallet list | TLS | Pseudonymised before inference | Supabase + RLS | Private (the link between you and the accounts) |
| Balances & transactions | TLS | — | Not stored by VEIL AI | **Public** on NEAR |
| Send / swap / stake requests | TLS | Never sent to the model | Not stored by VEIL AI. Swap quotes go to NEAR Intents (1Click), which sees your account, the tokens and amounts | Transactions are **public** on NEAR once signed |
| Verification metadata (nonces, check results) | TLS | — | Supabase + RLS, no content | Private |
| Email / auth | TLS | Never sent to the model | Supabase Auth | Private |

## What is protected

- **Computation:** NEAR AI Cloud runs models in Intel TDX confidential VMs with NVIDIA GPUs in confidential-computing mode. Operators, the cloud provider and administrators cannot read enclave memory. VEIL AI proves which code runs (TDX quote, compose hash bound to `mr_config`, GPU evidence) using a nonce it generated itself.
- **Gateway blindness (E2EE):** message contents are encrypted to a key that VEIL AI first verifies belongs to an attested enclave. The NEAR AI gateway relays only ciphertext.
- **Integrity:** every answer's signature is checked against the hashes of exactly what VEIL AI sent and received, and the signer is re-attested with a fresh nonce.
- **Isolation at rest:** every table uses Postgres Row Level Security (`auth.uid() = user_id`). The `anon` role has no access. Sensitive free text is additionally encrypted by the app when `DATA_ENCRYPTION_KEY` is set.
- **Address book:** contact names and account IDs are both encrypted with AES-256-GCM before storage (when `DATA_ENCRYPTION_KEY` is set), so the database doesn't reveal who you pay. Without an account, contacts stay in your browser only.
- **Usernames:** your username is public (anyone can check if it's taken). Only if you link a wallet does `@username → account` become resolvable by others — the same as sharing your address. Your email is never exposed by username sign-in.
- **Notifications:** generated and stored only in your browser; VEIL AI keeps no notification history on its servers.
- **Proof links contain no content:** only the model, timestamps, SHA-256 fingerprints, the enclave signature and check results. Sharing one reveals that you asked *something* at that time, not what.
- **Minimisation:** wallet IDs become "Wallet A/B", unknown counterparties become "Counterparty-N", and only data the question needs is fetched.

## What is NOT protected (be aware)

1. **VEIL AI's server is not a TEE.** It runs on Vercel and sees your question and portfolio context in plaintext while assembling the prompt. E2EE covers the hop from VEIL's server to the enclave, not browser-to-enclave. (True browser-to-enclave E2EE would need the browser to hold the NEAR AI API key, or a per-user key flow. See "Future work".)
2. **Public data providers** (RPC nodes, FastNEAR, NearBlocks, CoinGecko, 1Click) see which public accounts and tokens are queried, from VEIL's server IP.
3. **On-chain data is public.** Anyone can read your balances and history. VEIL AI hides the *association* and your *questions*, not the chain.
4. **Supabase** operators can access stored rows at the infrastructure level. App-level encryption mitigates this for messages, goals and reports, but not for metadata (timestamps, which wallets you track).
5. **TEE trust assumptions:** you must trust Intel (TDX) and NVIDIA (GPU CC) hardware and their attestation services, as stated in NEAR's verifier documentation.
6. **Receiver safety checks** query NearBlocks for the receiver's and your own recent public history from VEIL's server, and swap quotes go to NEAR Intents (1Click), which sees your account, the tokens and amounts.
7. When `NEAR_AI_E2EE=preferred` and no attested key is available, requests fall back to TLS-only to the gateway. The UI labels this "TLS only".

## User controls

- **History:** saving is opt-out per conversation and has a master switch in AI Memory. Conversations can be deleted individually.
- **AI memory:** nothing is saved without pressing Save. Users can view the exact object sent to the model, edit it, or delete all of it.
- **Processing history:** contains verification metadata only, and can be cleared at any time.
- **Reports:** generated on demand. Saving is optional and encrypted. PDFs are rendered in the browser.

## Logging

`lib/security/logger.ts` never logs prompts, answers or credentials, and logs account IDs only as salted SHA-256 fingerprints. NEAR AI request logs record the path, status and latency only.

## Future work

- Run VEIL AI's own backend inside a TEE (e.g. a NEAR AI / Phala CVM) and publish its attestation, extending the verified boundary to the context-assembly step.
- Browser-side E2EE with short-lived scoped credentials.
- Optional local-only mode where portfolio context is built in the browser.
