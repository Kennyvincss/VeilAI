"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NearConnector } from "@hot-labs/near-connect";

/**
 * NEAR wallet connection via NEAR Connect (@hot-labs/near-connect), which
 * runs each wallet's integration inside a sandboxed iframe.
 *
 * VEIL AI requests:
 *   - sign-in (account ID + public key);
 *   - a NEP-413 off-chain signed message proving account ownership;
 *   - transactions the user has explicitly reviewed in VEIL AI (send,
 *     stake, swap). Each one is shown again in the user's own wallet, which
 *     does the signing — VEIL AI never holds keys and never signs, and
 *     nothing is sent automatically.
 * VEIL AI never requests function-call access keys and never touches
 * private keys or seed phrases.
 */

let connectorPromise: Promise<NearConnector> | null = null;

function getConnector(network: "mainnet" | "testnet"): Promise<NearConnector> {
  connectorPromise ??= import("@hot-labs/near-connect").then(
    ({ NearConnector }) =>
      new NearConnector({
        network,
        footerBranding: null,
        features: { signMessage: true },
      }),
  );
  return connectorPromise;
}

/** Meteor Wallet: a web wallet that opens in a browser tab, nothing to install. */
export const WEB_WALLET_ID = "meteor-wallet";
export const WEB_WALLET_NAME = "Meteor Wallet";
export const WEB_WALLET_URL = { mainnet: "https://wallet.meteorwallet.app", testnet: "https://wallet.meteorwallet.app" } as const;
/** Second web wallet to suggest if the first one has trouble. */
export const ALT_WEB_WALLET = { id: "intear-wallet", name: "Intear Wallet", url: "https://wallet.intear.tech" } as const;

export interface PlannedTx {
  receiverId: string;
  actions: (
    | { type: "Transfer"; params: { deposit: string } }
    | { type: "FunctionCall"; params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string } }
  )[];
}

export interface ManifestWallet {
  id: string;
  name: string;
  icon?: string;
  website?: string;
  description?: string;
  platform?: Record<string, string>;
}

/** Wallets listed in NEAR Connect's official manifest (loaded at runtime). */
export async function loadManifestWallets(network: "mainnet" | "testnet"): Promise<ManifestWallet[]> {
  const c = await getConnector(network);
  await c.whenManifestLoaded.catch(() => undefined);
  return (c.manifest?.wallets ?? []) as unknown as ManifestWallet[];
}

/** Pull transaction hashes out of wallet outcomes (shape varies slightly by wallet). */
function outcomeHashes(outcomes: unknown): string[] {
  const list = Array.isArray(outcomes) ? outcomes : [outcomes];
  return list
    .map((o) => {
      const x = o as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | null;
      return x?.transaction?.hash ?? x?.transaction_outcome?.id ?? null;
    })
    .filter((h): h is string => typeof h === "string");
}

export interface OwnershipProof {
  accountId: string;
  publicKey: string;
  signature: string;
}

export function useNearWallet(network: "mainnet" | "testnet") {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    getConnector(network)
      .then(async (c) => {
        c.on("wallet:signOut", () => !cancelled && setAccountId(null));
        c.on("wallet:signIn", (e) => !cancelled && setAccountId(e.accounts[0]?.accountId ?? null));
        try {
          const { accounts } = await c.getConnectedWallet();
          if (!cancelled) setAccountId(accounts[0]?.accountId ?? null);
        } catch {
          /* not connected */
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [network]);

  /**
   * Plain sign-in: returns the public account ID. Pass a wallet id (e.g.
   * WEB_WALLET_ID) to open that wallet directly instead of the chooser.
   */
  const connect = useCallback(async (walletId?: unknown): Promise<string | null> => {
    setBusy(true);
    try {
      const c = await getConnector(network);
      // Guard: when used directly as an onClick handler the argument is an event.
      const wallet = await c.connect(typeof walletId === "string" ? { walletId } : undefined);
      const accounts = await wallet.getAccounts();
      const id = accounts[0]?.accountId ?? null;
      setAccountId(id);
      return id;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [network]);

  /** Sign-in plus a NEP-413 message signature for server-side ownership verification. */
  const connectWithProof = useCallback(
    async (challenge: { message: string; recipient: string; nonce: string }): Promise<OwnershipProof> => {
      setBusy(true);
      try {
        const c = await getConnector(network);
        const nonce = Uint8Array.from(atob(challenge.nonce), (ch) => ch.charCodeAt(0));
        const signed = new Promise<OwnershipProof>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Wallet did not return a signature in time.")), 180_000);
          c.once("wallet:signInAndSignMessage", (e) => {
            clearTimeout(timer);
            const a = e.accounts[0];
            if (!a?.signedMessage) return reject(new Error("The wallet did not return a signed message."));
            resolve({ accountId: a.accountId, publicKey: a.signedMessage.publicKey, signature: a.signedMessage.signature });
          });
        });
        await c.connect({ signMessageParams: { message: challenge.message, recipient: challenge.recipient, nonce } });
        const proof = await signed;
        setAccountId(proof.accountId);
        return proof;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [network],
  );

  /**
   * Ask the user's wallet to sign and send transactions they already
   * reviewed in VEIL AI. The wallet shows its own approval screen; if the
   * user rejects there, this throws and nothing is sent.
   */
  const signAndSend = useCallback(
    async (transactions: PlannedTx[]): Promise<string[]> => {
      if (!accountId) throw new Error("Connect a wallet first.");
      setBusy(true);
      try {
        const c = await getConnector(network);
        const wallet = await c.wallet();
        const outcomes =
          transactions.length === 1
            ? await wallet.signAndSendTransaction({ signerId: accountId, receiverId: transactions[0].receiverId, actions: transactions[0].actions as never })
            : await wallet.signAndSendTransactions({ signerId: accountId, transactions: transactions.map((t) => ({ receiverId: t.receiverId, actions: t.actions as never })) });
        return outcomeHashes(outcomes);
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [accountId, network],
  );

  const disconnect = useCallback(async () => {
    const c = await getConnector(network);
    await c.disconnect().catch(() => undefined);
    setAccountId(null);
  }, [network]);

  return { accountId, busy, connect, connectWithProof, disconnect, signAndSend };
}
