import "server-only";
import { Account, actions, JsonRpcProvider, KeyPair, KeyPairSigner, parseNearAmount, type KeyPairString } from "near-api-js";
import { getEnv, nearNetwork } from "@/lib/env";
import { rpcEndpoints, viewAccessKey } from "@/lib/near/rpc";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { topLevelFor } from "@/lib/username-rules";
import { log } from "@/lib/security/logger";

/**
 * Sponsored NEAR account creation ("alice.near").
 *
 * The user's browser generates the key pair and recovery phrase; this
 * server only ever receives the PUBLIC key. VEIL's own sponsor account
 * (NEAR_SPONSOR_*) calls `create_account` on the top-level registrar
 * (`near` on mainnet, `testnet` on testnet) and attaches a small deposit
 * that becomes the new account's balance. The sponsor key is VEIL's
 * operational key — never a user's.
 */

const GAS = BigInt("60000000000000"); // 60 Tgas, as near-api-js uses for create_account

export function sponsorConfig() {
  const env = getEnv();
  if (!env.NEAR_SPONSOR_ACCOUNT_ID || !env.NEAR_SPONSOR_PRIVATE_KEY?.startsWith("ed25519:")) return null;
  const depositNear = env.NEAR_SPONSOR_DEPOSIT_NEAR ?? "0.01";
  if (!/^\d+(\.\d+)?$/.test(depositNear)) return null;
  const deposit = parseNearAmount(depositNear as `${number}`);
  const daily = Number(env.NEAR_SPONSOR_DAILY_LIMIT ?? "25");
  if (!deposit) return null;
  return {
    accountId: env.NEAR_SPONSOR_ACCOUNT_ID,
    privateKey: env.NEAR_SPONSOR_PRIVATE_KEY as KeyPairString,
    depositYocto: BigInt(deposit),
    depositNear,
    dailyLimit: Number.isFinite(daily) && daily > 0 ? Math.floor(daily) : 25,
  };
}

/** Needs the sponsor key and the service role (for the tamper-proof ledger). */
export function sponsoredAccountsEnabled(): boolean {
  return sponsorConfig() !== null && supabaseAdmin() !== null;
}

export class SponsorError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export interface SponsoredRow {
  account_id: string;
  network: string;
  public_key: string;
  status: "pending" | "created" | "failed";
  tx_hash: string | null;
  created_at: string;
}

export async function sponsoredAccountFor(userId: string): Promise<SponsoredRow | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data, error } = await db.from("sponsored_accounts").select("account_id, network, public_key, status, tx_hash, created_at").eq("user_id", userId).maybeSingle();
  if (error) throw new SponsorError("Account creation isn't set up on this server yet.", 503);
  return (data as SponsoredRow | null) ?? null;
}

/**
 * Reserve the user's single slot before spending anything. A failed earlier
 * attempt can be retried; a pending or created one cannot.
 */
export async function reserveSlot(userId: string, accountId: string, publicKey: string): Promise<void> {
  const db = supabaseAdmin();
  const cfg = sponsorConfig();
  if (!db || !cfg) throw new SponsorError("Creating NEAR accounts isn't available right now.", 503);

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: countErr } = await db.from("sponsored_accounts").select("user_id", { count: "exact", head: true }).gte("created_at", since).neq("status", "failed");
  if (countErr) throw new SponsorError("Account creation isn't set up on this server yet.", 503);
  if ((count ?? 0) >= cfg.dailyLimit) throw new SponsorError("Today's free account limit has been reached. Please try again tomorrow, or create a wallet in a wallet app.", 429);

  const existing = await sponsoredAccountFor(userId);
  if (existing && existing.status !== "failed") throw new SponsorError(`You already have ${existing.account_id}. Each VEIL account can create one NEAR account.`, 409);

  const row = { user_id: userId, account_id: accountId, network: nearNetwork(), public_key: publicKey, status: "pending", tx_hash: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { error } = existing ? await db.from("sponsored_accounts").update(row).eq("user_id", userId).eq("status", "failed") : await db.from("sponsored_accounts").insert(row);
  if (error) {
    if (error.code === "23505") throw new SponsorError("That name was just taken. Please choose another.", 409);
    throw new SponsorError("Could not start account creation. Please try again.", 502);
  }
}

export async function finishSlot(userId: string, status: "created" | "failed", txHash: string | null) {
  const db = supabaseAdmin();
  if (!db) return;
  await db.from("sponsored_accounts").update({ status, tx_hash: txHash, updated_at: new Date().toISOString() }).eq("user_id", userId);
}

/** Send create_account from the sponsor, then confirm the key is on the new account. */
export async function createNamedAccount(accountId: string, publicKey: string): Promise<{ txHash: string | null }> {
  const cfg = sponsorConfig();
  if (!cfg) throw new SponsorError("Creating NEAR accounts isn't available right now.", 503);
  const provider = new JsonRpcProvider({ url: rpcEndpoints()[0] });
  const sponsor = new Account(cfg.accountId, provider, new KeyPairSigner(KeyPair.fromString(cfg.privateKey)));

  let txHash: string | null = null;
  try {
    const outcome = await sponsor.signAndSendTransaction({
      receiverId: topLevelFor(nearNetwork()),
      actions: [actions.functionCall("create_account", { new_account_id: accountId, new_public_key: publicKey }, GAS, cfg.depositYocto)],
      throwOnFailure: true,
    });
    txHash = outcome.transaction_outcome?.id ?? null;
  } catch (err) {
    log("error", "sponsor.create_account_failed", { hint: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    throw new SponsorError("The NEAR network didn't accept the new account. Nothing was charged to you; please try again.", 502);
  }

  // The registrar refunds and returns false if the name was taken in the meantime,
  // so trust the chain, not the call: the new key must now control the account.
  for (let i = 0; i < 5; i++) {
    const key = await viewAccessKey(accountId, publicKey).catch(() => null);
    if (key?.permission === "FullAccess") return { txHash };
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new SponsorError("The account couldn't be confirmed on NEAR (the name may have just been taken). Please try another name.", 409);
}
