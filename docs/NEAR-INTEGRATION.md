# NEAR Integration

This document lists every NEAR technology VEIL AI uses, exactly how it is called, and where in the code it lives. Nothing here is aspirational: each item is implemented.

| Capability | NEAR technology | Code |
|---|---|---|
| Confidential AI inference (streaming) | NEAR AI Cloud `/v1/chat/completions` | `lib/near-ai/client.ts` |
| Model catalogue | NEAR AI Cloud `/v1/models` | `lib/near-ai/client.ts`, `app/api/privacy/models` |
| TEE attestation | NEAR AI Cloud `/v1/attestation/report` | `lib/near-ai/verify.ts` |
| Per-response signatures | NEAR AI Cloud `/v1/signature/{chat_id}` | `lib/near-ai/verify.ts`, `lib/near-ai/checks.ts` |
| End-to-end encryption to the enclave | NEAR AI E2EE protocol v2 | `lib/near-ai/e2ee.ts` |
| Token prices & liquidity signal | NEAR Intents 1Click `GET /v0/tokens` | `lib/blockchain/prices.ts` |
| Wallet connection | NEAR Connect (`@hot-labs/near-connect`) | `hooks/use-near-wallet.ts` |
| Wallet ownership proofs | NEP-413 signed messages + RPC `view_access_key` | `lib/near/nep413.ts`, `app/api/wallet/verify` |
| Balances, staking, FT metadata | NEAR JSON-RPC (`view_account`, `call_function`) | `lib/near/rpc.ts` |
| FT holdings / staking pools | FastNEAR API | `lib/blockchain/fastnear.ts` |
| Transaction & token-transfer history | NearBlocks API | `lib/blockchain/nearblocks.ts` |

## Sources consulted

The integration follows NEAR's own code, not guesses:

- **[nearai/nearai-cloud-verifier](https://github.com/nearai/nearai-cloud-verifier)** — `ts/model_verifier.ts`, `ts/chat_verifier.ts`, `ts/encrypted_chat_verifier.ts`, `py/encrypted_agent_loop_verifier.py`. VEIL AI's verification is a TypeScript port of these checks.
- **[nearai/cloud-api](https://github.com/nearai/cloud-api)** — `README.md`, `docs/local-development.md` (endpoint table and auth model).
- **[@defuse-protocol/one-click-sdk-typescript](https://www.npmjs.com/package/@defuse-protocol/one-click-sdk-typescript)** — the `TokenResponse` type and `OneClickService.getTokens()` (public, no JWT).
- **[@hot-labs/near-connect](https://github.com/azbang/hot-connector)** — the `NearConnector` type definitions (`connect({ signMessageParams })`, `wallet:signInAndSignMessage`).
- **[NEP-413](https://github.com/near/NEPs/blob/master/neps/nep-0413.md)** — the signed-message payload format.
- **[fastnear/fastnear-api-server-rs](https://github.com/fastnear/fastnear-api-server-rs)** and **[Nearblocks/nearblocks](https://github.com/Nearblocks/nearblocks)** (`apps/api/src/routes/account.ts`, `services/account/{txn,ft}.ts`) for response shapes.

## 1. NEAR AI Cloud inference

- **Auth:** `Authorization: Bearer $NEAR_AI_API_KEY`, sent from the server only (`lib/near-ai/client.ts`). The key never reaches the browser.
- **Model:** `NEAR_AI_MODEL`, default `deepseek-ai/DeepSeek-V4.1-Flash-1017`, which NEAR serves from its own attested TEE infrastructure (`owned_by: "nearai"` in `GET /v1/models`). Proxied third-party models in the catalogue (`openai/…`, `anthropic/…`, `google/…`) are not TEE-hosted, and their attestation reports contain no GPU enclave, so VEIL AI correctly reports them as FAILED. The Privacy Centre checks the configured model is listed in the catalogue. Verified live on 2026-11-05: gateway and model TDX quotes UpToDate, nonce bound, NVIDIA verdict true, compose hash equal to `mr_config`, and the E2EE key attested.
- **Streaming:** `POST /v1/chat/completions` with `stream: true`. The server serialises the request body **once** and keeps the **raw SSE bytes**, because NEAR AI signs `sha256(request_body):sha256(response_text)`. Deltas are forwarded to the browser as NDJSON (`app/api/ai/chat/route.ts`).

## 2. Attestation verification (fresh nonce)

`verifyModelAttestation()` and `verifyCompletion()` in `lib/near-ai/verify.ts`:

1. Generate a **fresh 32-byte random nonce** (`crypto.randomBytes(32)`) for every verification.
2. `GET /v1/attestation/report?model=…&nonce=…&signing_algo=…[&signing_address=…]`.
3. For each attestation (gateway and every model enclave):
   - **Intel TDX quote**: verified with `@phala/dcap-qvl` (`getCollateralFromPcs` against Intel PCS, then `verify`), the pure-JS build of the library NEAR's verifier uses. It is pinned to a release patched for CVE-2026-22696 / GHSA-796p-j2gh-9m2q (QE Identity signature and QE Report policy are verified); the WASM package `@phala/dcap-qvl-node` has no patched release and is no longer used. Accepted TCB statuses: `UpToDate`, and `OutOfDate` (valid signature chain, platform below Intel's latest baseline), matching NEAR's verifier.
   - **report_data binding**: bytes `[0..32)` must equal the padded signing address (or `SHA256(address ‖ tls_fp)` in TLS mode), and bytes `[32..64)` must equal **our nonce**. A missing nonce means a stale or replayed quote, so the check fails.
   - **NVIDIA GPU evidence** (model enclaves): the payload's nonce must equal ours, and the evidence is POSTed to NVIDIA NRAS (`/v3/attest/gpu`). `x-nvidia-overall-att-result` must be true. As an extra (advisory) step, the NRAS token signature is verified against NVIDIA's JWKS.
   - **Container manifest**: `mr_config` from the verified quote must equal `0x01 ‖ sha256(app_compose)`. Image digests are listed with Sigstore search links.
4. The result is **VERIFIED only if every required check passes for every target**, and at least one model (GPU) attestation is present. If the report can't be obtained, the state is **UNVERIFIED**. With no API key it is **NOT CONNECTED**. Simulated verification does not exist anywhere in the codebase.

## 3. Per-answer verification

After each streamed answer (`verifyCompletion`):

1. `GET /v1/signature/{chat_id}?model=…&signing_algo=…` (with retries, since signatures can lag the stream).
2. Compare the signed request hash with `sha256` of the exact body sent, and the signed response hash with `sha256` of the exact raw bytes received.
3. Recover the signer: ECDSA via EIP-191 `verifyMessage`, or Ed25519 verification.
4. Fetch a **new** attestation with a **new nonce** for that `signing_address`, then verify it as in §2.

## 4. End-to-end encryption (protocol v2)

`lib/near-ai/e2ee.ts`, mirroring `py/encrypted_agent_loop_verifier.py`:

- Before encrypting anything, `getAttestedEncryptionKey()` fetches the model's Ed25519 `signing_public_key` with a fresh nonce and checks that it **equals the attested signing address**. It then fully verifies that enclave (TDX + report data + GPU + compose). Verified keys are cached for 10 minutes.
- Each message: ephemeral X25519 key → ECDH with the model key (converted Ed25519→X25519) → HKDF-SHA256 (`salt=None`, `info="ed25519_encryption"`) → XChaCha20-Poly1305. Wire format: `eph_pub(32) ‖ nonce(24) ‖ ciphertext+tag`, as hex.
- Headers: `X-Signing-Algo: ed25519`, `X-Client-Pub-Key`, `X-Encryption-Version: 2`, `X-Encrypt-All-Fields: true`.
- Responses are encrypted to a per-request client key and decrypted on the server. If any chunk fails to decrypt, it is never shown.
- `NEAR_AI_E2EE=required` refuses to send anything when no attested key is available. `preferred` falls back to TLS and says so in the UI and in the verification record.

## 5. NEAR Intents

`GET https://1click.chaindefuser.com/v0/tokens` is unauthenticated per the 1Click SDK (only quote, deposit and status endpoints need a JWT). VEIL AI uses it to:

- price NEAR fungible tokens by contract address, with native NEAR priced via `wrap.near`;
- derive the **liquidity** risk signal: the share of value not routable through NEAR Intents (plus staked NEAR, which has an unbonding period);
- pass `coingeckoId` through to CoinGecko for price history.

**Swaps** (Wallet → Swap) use the 1Click API with the deployer's JWT (`ONECLICK_JWT`, server-side only):

- `POST /v0/quote` with `swapType: EXACT_INPUT`, `depositType`/`refundType: ORIGIN_CHAIN`, `recipientType: DESTINATION_CHAIN`, `refundTo` and `recipient` set to the connected account, user-chosen slippage (0.5–2%) and a 20-minute deadline. Previews use `dry: true`; the final quote uses `dry: false` to get a deposit address.
- The quote is rejected unless `recipient` and `refundTo` equal the user's account and `amountIn` ≤ the requested amount.
- Deposit: native NEAR is a plain `Transfer` to the deposit address; NEP-141 tokens are `storage_deposit` (registration only) + `ft_transfer` to the deposit address. The user's wallet signs.
- After signing, `POST /v0/deposit/submit` speeds up detection and `GET /v0/status` is polled to show progress (pending → processing → success / refunded / failed).

Without `ONECLICK_JWT`, the Swap tab says swaps are unavailable; nothing else is affected.

## 5b. Send and stake

- **Send:** NEAR is a `Transfer` (limited to the spendable balance: total − storage-locked − 0.05 NEAR gas reserve). NEP-141 tokens use `ft_transfer` (1 yoctoNEAR, 30 Tgas), preceded by `storage_deposit` when `storage_balance_of` shows the receiver isn't registered. The receiver must exist, except a new 64-hex implicit account for NEAR only.
- **Stake:** validators come from RPC `validators` (current set, `.poolv1.near`/`.pool.near`), with fees from `get_reward_fee_fraction`. Actions follow the core staking-pool interface: `deposit_and_stake`, `unstake { amount }`, `withdraw_all`, with positions from `get_account`. Minimum 1 NEAR; unstaked NEAR is withdrawable after ~4 epochs (2–3 days).

## 6. Wallets and NEP-413

- `NearConnector` is created with `features: { signMessage: true }`. VEIL AI requests sign-in, sign-in plus a signed message, and — only from the Wallet page after the user reviews a plan — `signAndSendTransaction(s)`. It never requests function-call access keys.
- **Ownership proof:** the server issues a 32-byte nonce and a message inside an HMAC-signed, httpOnly, 5-minute, single-use cookie (`/api/wallet/challenge`). The wallet signs it via NEP-413. `/api/wallet/verify` rebuilds the Borsh payload (tag `2^31+413`), verifies the Ed25519 signature, and confirms via RPC `view_access_key` that the key is a **FullAccess** key on the claimed account.

## 7. Public chain data

- **RPC:** `view_account` (balance, storage, code hash), `call_function` for `ft_metadata` (NEP-148) and staking-pool `get_account_total_balance`, and `view_access_key` (NEP-413). Endpoints: `NEAR_RPC_URLS`, or FastNEAR's free RPC falling back to `rpc.mainnet.near.org`.
- **FastNEAR:** `/v1/account/{id}/ft` and `/v1/account/{id}/staking`.
- **NearBlocks:** `/v1/account/{id}/txns-only`, `/ft-txns` and `/txns-only/count`.

## Fees

VEIL AI is free. NEAR AI Cloud inference is billed to the **deployer's** NEAR AI account, not to users. Public data APIs may rate-limit anonymous traffic. VEIL AI charges no fee on transactions. When a user sends, swaps or stakes, their wallet pays standard NEAR gas (typically under 0.001 NEAR); swaps also include the NEAR Intents route fee, which is reflected in the quote shown before approval.
