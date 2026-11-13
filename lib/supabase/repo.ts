import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessage, ConversationSummary, FinancialPreferences, FinancialReport, VerificationResult } from "@/types";
import { decryptField, encryptField } from "@/lib/security/crypto";
import { nearNetwork } from "@/lib/env";

/**
 * Data-access layer. Every function receives a request-scoped Supabase
 * client authenticated as the user (anon key + session), so Row Level
 * Security enforces ownership in the database. `userId` is also passed and
 * filtered on explicitly as defence in depth.
 */

export interface TrackedWallet {
  id: string;
  accountId: string;
  label: string | null;
  network: string;
  ownershipVerified: boolean;
  createdAt: string;
}

export async function listWallets(db: SupabaseClient, userId: string): Promise<TrackedWallet[]> {
  const { data, error } = await db
    .from("tracked_wallets")
    .select("id, account_id, label, network, ownership_verified, created_at")
    .eq("user_id", userId)
    .eq("network", nearNetwork())
    .order("created_at", { ascending: true });
  if (error) throw new Error("Could not load tracked wallets");
  return (data ?? []).map((r) => ({
    id: r.id,
    accountId: r.account_id,
    label: r.label,
    network: r.network,
    ownershipVerified: r.ownership_verified,
    createdAt: r.created_at,
  }));
}

export async function addWallet(
  db: SupabaseClient,
  userId: string,
  accountId: string,
  label: string | null,
  verified?: { publicKey: string },
): Promise<void> {
  const row = {
    user_id: userId,
    account_id: accountId,
    label,
    network: nearNetwork(),
    ...(verified ? { ownership_verified: true, verified_public_key: verified.publicKey, verified_at: new Date().toISOString() } : {}),
  };
  const { error } = await db.from("tracked_wallets").upsert(row, { onConflict: "user_id,account_id,network" });
  if (error) throw new Error("Could not save wallet");
}

export async function removeWallet(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from("tracked_wallets").delete().eq("user_id", userId).eq("id", id);
  if (error) throw new Error("Could not remove wallet");
}

/* ---------------- conversations ---------------- */

export async function listConversations(db: SupabaseClient, userId: string): Promise<ConversationSummary[]> {
  const { data, error } = await db
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Could not load conversations");
  return (data ?? []).map((c) => ({ id: c.id, title: decryptField(c.title), createdAt: c.created_at, updatedAt: c.updated_at }));
}

export async function createConversation(db: SupabaseClient, userId: string, title: string): Promise<string> {
  const { data, error } = await db
    .from("conversations")
    .insert({ user_id: userId, title: encryptField(title.slice(0, 80)) })
    .select("id")
    .single();
  if (error || !data) throw new Error("Could not create conversation");
  return data.id as string;
}

export async function conversationExists(db: SupabaseClient, userId: string, id: string): Promise<boolean> {
  const { data } = await db.from("conversations").select("id").eq("user_id", userId).eq("id", id).maybeSingle();
  return Boolean(data);
}

export async function deleteConversation(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from("conversations").delete().eq("user_id", userId).eq("id", id);
  if (error) throw new Error("Could not delete conversation");
}

export async function getMessages(db: SupabaseClient, userId: string, conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from("messages")
    .select("id, role, content, meta, created_at")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error("Could not load messages");
  return (data ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    content: decryptField(m.content),
    createdAt: m.created_at,
    meta: m.meta ?? {},
  }));
}

export async function addMessage(
  db: SupabaseClient,
  userId: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  meta: ChatMessage["meta"] = {},
): Promise<string | null> {
  const { data, error } = await db
    .from("messages")
    .insert({ user_id: userId, conversation_id: conversationId, role, content: encryptField(content), meta })
    .select("id")
    .single();
  if (error) return null;
  return (data?.id as string) ?? null;
}

/* ---------------- preferences ---------------- */

export const DEFAULT_PREFERENCES: FinancialPreferences = {
  timeframe: null,
  riskTolerance: null,
  ecosystems: [],
  watchlist: [],
  goals: null,
  useInAi: false,
  saveChatHistory: true,
  updatedAt: null,
};

export async function getPreferences(db: SupabaseClient, userId: string): Promise<FinancialPreferences | null> {
  const { data, error } = await db.from("preferences").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Could not load preferences");
  if (!data) return null;
  return {
    timeframe: data.timeframe,
    riskTolerance: data.risk_tolerance,
    ecosystems: data.ecosystems ?? [],
    watchlist: data.watchlist ?? [],
    goals: data.goals ? decryptField(data.goals) : null,
    useInAi: data.use_in_ai,
    saveChatHistory: data.save_chat_history,
    updatedAt: data.updated_at,
  };
}

export async function savePreferences(db: SupabaseClient, userId: string, p: FinancialPreferences): Promise<void> {
  const { error } = await db.from("preferences").upsert(
    {
      user_id: userId,
      timeframe: p.timeframe,
      risk_tolerance: p.riskTolerance,
      ecosystems: p.ecosystems,
      watchlist: p.watchlist,
      goals: p.goals ? encryptField(p.goals) : null,
      use_in_ai: p.useInAi,
      save_chat_history: p.saveChatHistory,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error("Could not save preferences");
}

export async function deletePreferences(db: SupabaseClient, userId: string): Promise<void> {
  const { error } = await db.from("preferences").delete().eq("user_id", userId);
  if (error) throw new Error("Could not delete preferences");
}

/* ---------------- processing log ---------------- */

export interface ProcessingLogEntry {
  id: string;
  kind: "chat" | "attestation" | "report";
  model: string | null;
  state: string;
  e2ee: boolean;
  nonce: string | null;
  chatId: string | null;
  summary: string | null;
  result: unknown;
  durationMs: number | null;
  createdAt: string;
}

/** Store verification metadata only — check outcomes and hashes, never content. */
export async function logProcessing(db: SupabaseClient, userId: string, kind: ProcessingLogEntry["kind"], v: VerificationResult): Promise<void> {
  const compact = {
    targets: v.targets.map((t) => ({
      kind: t.kind,
      signingAddress: t.signingAddress,
      verified: t.verified,
      tdxStatus: t.tdxStatus,
      gpuVerdict: t.gpuVerdict,
      checks: t.checks.map((c) => ({ id: c.id, status: c.status, required: c.required })),
    })),
    completionChecks: v.completionChecks.map((c) => ({ id: c.id, status: c.status })),
    errors: v.errors.slice(0, 3),
  };
  await db.from("processing_log").insert({
    user_id: userId,
    kind,
    model: v.model,
    state: v.state,
    e2ee: v.e2ee.enabled,
    nonce: v.nonce,
    chat_id: v.chatId ?? null,
    summary: v.summary.slice(0, 600),
    result: compact,
    duration_ms: v.durationMs,
  });
}

export async function listProcessing(db: SupabaseClient, userId: string): Promise<ProcessingLogEntry[]> {
  const { data, error } = await db
    .from("processing_log")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Could not load processing history");
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    model: r.model,
    state: r.state,
    e2ee: r.e2ee,
    nonce: r.nonce,
    chatId: r.chat_id,
    summary: r.summary,
    result: r.result,
    durationMs: r.duration_ms,
    createdAt: r.created_at,
  }));
}

export async function clearProcessing(db: SupabaseClient, userId: string): Promise<void> {
  await db.from("processing_log").delete().eq("user_id", userId);
}

/* ---------------- reports ---------------- */

export async function saveReport(db: SupabaseClient, userId: string, r: FinancialReport): Promise<string | null> {
  const { data, error } = await db
    .from("reports")
    .insert({ user_id: userId, type: r.type, title: r.title.slice(0, 160), mode: r.mode, content: encryptField(JSON.stringify(r)) })
    .select("id")
    .single();
  if (error) return null;
  return data.id as string;
}

export async function listReports(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("reports")
    .select("id, type, title, mode, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Could not load reports");
  return (data ?? []).map((r) => ({ id: r.id as string, type: r.type as string, title: r.title as string, mode: r.mode as string, createdAt: r.created_at as string }));
}

export async function getReport(db: SupabaseClient, userId: string, id: string): Promise<FinancialReport | null> {
  const { data } = await db.from("reports").select("content").eq("user_id", userId).eq("id", id).maybeSingle();
  if (!data) return null;
  try {
    return { ...(JSON.parse(decryptField(data.content)) as FinancialReport), id };
  } catch {
    return null;
  }
}

export async function deleteReport(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from("reports").delete().eq("user_id", userId).eq("id", id);
  if (error) throw new Error("Could not delete report");
}

/* ---------------- Address book ---------------- */

export interface Contact {
  id: string;
  label: string;
  accountId: string;
  createdAt: string;
}

/** Thrown when the contacts table hasn't been created (migration not run). */
export class NotSetUpError extends Error {}

export async function listContacts(db: SupabaseClient, userId: string): Promise<Contact[]> {
  const { data, error } = await db
    .from("contacts")
    .select("id, label, account_id, created_at")
    .eq("user_id", userId)
    .eq("network", nearNetwork())
    .order("created_at", { ascending: true });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") throw new NotSetUpError("contacts table missing");
    throw new Error("Could not load contacts");
  }
  return (data ?? []).map((r) => ({ id: r.id, label: decryptField(r.label), accountId: decryptField(r.account_id), createdAt: r.created_at }));
}

export async function addContact(db: SupabaseClient, userId: string, label: string, accountId: string): Promise<string> {
  const { data, error } = await db
    .from("contacts")
    .insert({ user_id: userId, network: nearNetwork(), label: encryptField(label), account_id: encryptField(accountId) })
    .select("id")
    .single();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") throw new NotSetUpError("contacts table missing");
    throw new Error("Could not save contact");
  }
  return data.id as string;
}

export async function removeContact(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db.from("contacts").delete().eq("user_id", userId).eq("id", id);
  if (error) throw new Error("Could not delete contact");
}
