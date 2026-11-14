# VEIL AI — Hackathon submission

**Track:** NEAR Hackathon 2026 — Privacy & Private AI

**One line:** A free, privacy-first NEAR app where an AI analyses your portfolio and wallet risk inside verified hardware enclaves, and you can send, receive, swap and stake from your own wallet, approving every transaction yourself.

## The problem

To get useful financial advice from an AI, you have to hand over the most sensitive things you have: what you own, what you trade and what you're worried about. Today that means trusting a company's servers and its promises. Crypto adds a second risk: one wrong address, a look-alike scam account or a fake "AI assistant" asking for a seed phrase, and the funds are gone.

## What VEIL AI does

- **Private AI analyst.** Questions about your portfolio, risks and on-chain behaviour are answered by a model running inside an Intel TDX + NVIDIA confidential-computing enclave on **NEAR AI Cloud**. Messages are end-to-end encrypted to a key VEIL first proves lives in that enclave.
- **Every answer is verified, not just claimed.** VEIL checks the enclave's signature over the exact request and response, then fetches a fresh attestation with its own random nonce and verifies it with Intel and NVIDIA. **VERIFIED** appears only when every required check passes.
- **Shareable proof.** Any verified answer can be shared as a public link that contains no question or answer text. The proof page re-checks the signature on load, and anyone can run a fresh attestation of the same enclave key.
- **Wallet you control.** Connect a NEAR wallet, or create/import one in a trusted wallet app (VEIL never sees keys). Send, receive, swap (NEAR Intents) and stake from one page. Each transaction is prepared and checked on the server, shown in a plain-language review, and signed only in your wallet.
- **Scam protection before you send.** A receiver safety check flags look-alike accounts (including 64-hex address poisoning), token contracts, brand-new or empty accounts, risk-listed accounts and suspicious activity patterns. Dangerous findings must be acknowledged before approval.
- **Talk to your wallet.** Type "stake 5 NEAR with the lowest-fee validator" or "send 2 NEAR to bob.near": the analyst prepares it as a card that goes through the same checks, review and wallet approval. Actions come only from your own words, never from model output, so a prompt-injected answer can't move funds.
- **Wallet intelligence and risk engine.** Investigate any public account with evidence-based indicators; a seven-category risk score with every input shown.
- **Free.** No subscriptions, paywalls or fees. The only costs are NEAR network gas (paid by your wallet, typically under 0.001 NEAR) and, for swaps, the route fee shown in the quote.

## How it fits Privacy & Private AI

| Criterion | How VEIL AI meets it |
|---|---|
| Private inference | Model runs in a TEE on NEAR AI Cloud; operators can't read enclave memory |
| Verifiability | Per-answer signature + fresh-nonce TDX/GPU attestation, ported from NEAR's official verifier; never shows VERIFIED on failure |
| Data in transit | E2EE (Ed25519→X25519, XChaCha20-Poly1305) to an attested enclave key |
| Data minimisation | Wallets pseudonymised ("Wallet A"), counterparties anonymised, only data the question needs |
| Data at rest | Row Level Security on every table; chats, goals, reports and the address book encrypted with AES-256-GCM |
| User control | Opt-in memory, deletable history, no key handling, every transaction approved in the user's wallet |
| Honesty about limits | Docs and UI state what isn't protected (VEIL's own server isn't a TEE; on-chain data is public) |

## NEAR technology used

NEAR AI Cloud (confidential inference, attestation, signatures, E2EE) · NEAR Connect (wallets) · NEP-413 (ownership proofs) · NEP-141/NEP-145 (tokens, storage) · NEAR staking-pool interface and RPC validators · NEAR Intents 1Click (swaps) · FastNEAR and NearBlocks (public data) · mainnet and testnet.

## Try it

- **Live app:** https://www.veilainear.xyz
- **Testnet version (no real money):** _add your testnet URL_ (free test NEAR: near-faucet.io)
- **Code:** https://github.com/Kennyvincss/VeilAI
- **Docs:** `README.md`, `docs/PRIVACY.md`, `docs/SECURITY.md`, `docs/NEAR-INTEGRATION.md`, `docs/ARCHITECTURE.md`

---

## Demo video script (about 2½ minutes)

Record at 1280×800 or larger, with the browser zoomed to 110% so text is readable. Use a wallet with a little NEAR, and have the AI credit topped up.

| # | Time | Screen | What to say |
|---|---|---|---|
| 1 | 0:00–0:15 | Landing page | "Getting AI help with your money means handing over your most private data. VEIL AI is an AI financial analyst that can't see your data — and proves it." |
| 2 | 0:15–0:35 | Dashboard → AI Analyst. Ask "What are my biggest financial risks?" | "My question is encrypted to an AI running inside secure hardware on NEAR AI Cloud. Watch the steps: processing in the enclave, then verifying." |
| 3 | 0:35–0:55 | Answer with **VERIFIED** badge; open "Verification details" | "VEIL didn't just trust it. It checked the enclave's signature on this exact answer and ran a fresh Intel and NVIDIA attestation with its own random nonce." |
| 4 | 0:55–1:10 | Click **Copy proof link**, open it in a new tab | "Anyone can check this proof. It contains no question or answer — just fingerprints and signatures — and you can run a fresh check right here." |
| 5 | 1:10–1:35 | Back in the analyst, type "Stake 5 NEAR with the lowest-fee validator" | "I can also just ask. VEIL prepares the stake with the lowest-fee validator — but nothing happens until I review it and approve it in my own wallet." Click Review → show review → approve in wallet. |
| 6 | 1:35–2:05 | Wallet → Send. Beforehand, save a contact; now type an existing account that differs from it by one character, small amount, Review | "Before I send, VEIL checks who I'm paying. This account looks like one of my saved contacts — a classic scam. I'd have to explicitly confirm before my wallet even opens." Cancel. |
| 7 | 2:05–2:20 | Wallet tabs: Receive (QR), Swap, Activity | "Receive, swap through NEAR Intents, stake and see my history — all from my own wallet. VEIL never holds keys and charges nothing." |
| 8 | 2:20–2:35 | Privacy Centre | "And the Privacy Centre shows, in plain language, what's protected and what isn't. Private AI you can verify, on NEAR." |

**Tips:** do one dry run first; keep amounts tiny; if a live answer is slow, cut the wait in editing. Don't show your full account balance or email if you'd rather keep them private.
