"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NearConnector } from "@hot-labs/near-connect";

/**
 * NEAR wallet connection via NEAR Connect (@hot-labs/near-connect), which
 * runs each wallet's integration inside a sandboxed iframe.
 *
 * VEIL AI only ever requests:
 *   - sign-in (account ID + public key), and
 *   - a NEP-413 off-chain signed message proving account ownership.
 * It never requests transaction signing or function-call keys, and never
 * touches private keys. The wallet library stores only its own session
 * metadata; no private keys are placed in browser storage by VEIL AI.
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

  /** Plain sign-in: returns the public account ID. */
  const connect = useCallback(async (): Promise<string | null> => {
    setBusy(true);
    try {
      const c = await getConnector(network);
      const wallet = await c.connect();
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

  const disconnect = useCallback(async () => {
    const c = await getConnector(network);
    await c.disconnect().catch(() => undefined);
    setAccountId(null);
  }, [network]);

  return { accountId, busy, connect, connectWithProof, disconnect };
}
