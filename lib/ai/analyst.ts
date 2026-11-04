import "server-only";
import type { DataSource, FinancialPreferences, NormalizedTx, PortfolioSnapshot, RiskAnalysis, VerificationResult, VerificationState } from "@/types";
import type { RequestContext } from "@/lib/session";
import { getAppStatus, nearAiConfig } from "@/lib/env";
import { streamChatCompletion, NearAiError, type ChatMessageIn } from "@/lib/near-ai/client";
import { createE2eeSession, type E2eeSession } from "@/lib/near-ai/e2ee";
import { getAttestedEncryptionKey, verifyCompletion } from "@/lib/near-ai/verify";
import { ANALYST_SYSTEM_PROMPT, INJECTION_REMINDER } from "@/lib/ai/prompts";
import { buildContextMessage, detectIntents, Pseudonymizer } from "@/lib/ai/context";
import { cleanUserText, screenUserInput } from "@/lib/security/prompt-guard";
import { fetchLivePortfolio } from "@/lib/portfolio/service";
import { liveRiskAnalysis } from "@/lib/risk/service";
import { accountTransactions, normalizeTxn } from "@/lib/blockchain/nearblocks";
import { demoPortfolio, demoRiskAnalysis, demoTransactions } from "@/lib/demo/data";
import { demoAnswer } from "@/lib/demo/responses";
import * as repo from "@/lib/supabase/repo";
import { log } from "@/lib/security/logger";

export type AnalystEvent =
  | { type: "status"; state: VerificationState; message: string }
  | {
      type: "meta";
      mode: "live" | "demo";
      inference: "near-ai" | "demo-template";
      model: string | null;
      e2ee: VerificationResult["e2ee"];
      sources: DataSource[];
      notes: string[];
      conversationId: string | null;
    }
  | { type: "delta"; text: string }
  | { type: "verification"; result: VerificationResult }
  | { type: "done"; messageId: string | null; conversationId: string | null }
  | { type: "error"; message: string };

export interface AnalystInput {
  ctx: RequestContext;
  question: string;
  conversationId: string | null;
  clientHistory: { role: "user" | "assistant"; content: string }[];
  saveHistory: boolean;
  emit: (e: AnalystEvent) => void;
  signal?: AbortSignal;
}

const notConnected = (model: string, reason: string): VerificationResult => {
  const now = new Date().toISOString();
  return {
    state: "not-connected",
    model,
    nonce: "",
    startedAt: now,
    completedAt: now,
    durationMs: 0,
    targets: [],
    completionChecks: [],
    e2ee: { enabled: false, reason },
    summary: `UNVERIFIED — ${reason}`,
    errors: [],
  };
};

export async function runAnalyst(input: AnalystInput): Promise<void> {
  const { ctx, emit } = input;
  const ai = nearAiConfig();
  const status = getAppStatus();
  const question = cleanUserText(input.question);
  emit({ type: "status", state: "initialising", message: "Preparing your financial context…" });

  /* 1. Retrieve the data this question needs (minimal set). */
  const intents = detectIntents(question);
  let portfolio: PortfolioSnapshot | null = null;
  let risk: RiskAnalysis | null = null;
  let txs: NormalizedTx[] | null = null;
  let prefs: FinancialPreferences | null = null;
  let ownWallets: string[] = [];
  const notes: string[] = [];

  if (ctx.user && ctx.supabase) {
    const wallets = await repo.listWallets(ctx.supabase, ctx.user.id).catch(() => []);
    ownWallets = wallets.map((w) => w.accountId);
    prefs = await repo.getPreferences(ctx.supabase, ctx.user.id).catch(() => null);
    if (wallets.length > 0) {
      portfolio = await fetchLivePortfolio(wallets.map((w) => ({ accountId: w.accountId, label: w.label }))).catch(() => null);
      if (!portfolio) notes.push("Live portfolio data could not be retrieved; the analyst answered without it.");
      if (portfolio && intents.has("risk")) risk = await liveRiskAnalysis(portfolio).catch(() => null);
      if (intents.has("transactions")) {
        txs = await accountTransactions(ownWallets[0], 30)
          .then((list) => list.map((t) => normalizeTxn(ownWallets[0], t)))
          .catch(() => null);
      }
    } else {
      notes.push("No wallets are tracked yet — add a NEAR account on the dashboard for personalised analysis.");
    }
  } else {
    portfolio = demoPortfolio();
    risk = demoRiskAnalysis();
    if (intents.has("transactions")) txs = demoTransactions();
    ownWallets = portfolio.wallets.map((w) => w.accountId);
    notes.push("Demo session: analysis uses SAMPLE portfolio data.");
  }

  const mode = ctx.user ? "live" : "demo";
  const sources = dedupeSources([...(portfolio?.provenance.sources ?? []), ...(risk?.provenance.sources ?? [])]);
  const liveAllowed = ai.configured && (ctx.user !== null || status.demoAllowsLiveAi);

  /* 2a. No NEAR AI available → clearly-labelled template answer. */
  if (!liveAllowed) {
    const reason = ai.configured
      ? "Live inference is disabled for demo visitors on this deployment."
      : "NEAR AI Cloud is not configured on this deployment.";
    emit({ type: "meta", mode, inference: "demo-template", model: null, e2ee: { enabled: false, reason }, sources, notes: [...notes, reason], conversationId: null });
    const text = demoAnswer(question, portfolio ?? demoPortfolio(), risk ?? demoRiskAnalysis());
    for (const chunk of text.match(/[\s\S]{1,48}/g) ?? []) {
      emit({ type: "delta", text: chunk });
      await new Promise((r) => setTimeout(r, 12));
    }
    emit({ type: "verification", result: notConnected(ai.model, reason) });
    emit({ type: "done", messageId: null, conversationId: null });
    return;
  }

  /* 2b. Live confidential inference via NEAR AI Cloud. */
  const ps = new Pseudonymizer(ownWallets);
  const contextText = buildContextMessage({ portfolio, risk, transactions: txs, preferences: prefs, ps });
  const screen = screenUserInput(question);
  if (screen.suspicious) log("warn", "prompt_injection.screened", { matched: screen.matched });

  // History: authoritative from DB for signed-in users, bounded client history for demo.
  let history: { role: "user" | "assistant"; content: string }[] = [];
  let conversationId = input.conversationId;
  if (ctx.user && ctx.supabase && conversationId) {
    if (!(await repo.conversationExists(ctx.supabase, ctx.user.id, conversationId))) conversationId = null;
    else history = (await repo.getMessages(ctx.supabase, ctx.user.id, conversationId).catch(() => [])).slice(-10).map((m) => ({ role: m.role, content: m.content }));
  } else if (!ctx.user) {
    history = input.clientHistory.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  }

  const system = `${ANALYST_SYSTEM_PROMPT}\n\n${contextText}${screen.suspicious ? `\n\n${INJECTION_REMINDER}` : ""}`;
  const messages: ChatMessageIn[] = [{ role: "system", content: system }, ...history, { role: "user", content: question }];

  // E2EE: only encrypt to a key proven (fresh nonce) to live in an attested TEE.
  let e2ee: E2eeSession | null = null;
  let e2eeInfo: VerificationResult["e2ee"] = { enabled: false };
  if (ai.e2ee !== "off") {
    emit({ type: "status", state: "verifying", message: "Verifying the model enclave before encrypting…" });
    const { key, reason } = await getAttestedEncryptionKey(ai.model);
    if (key) {
      e2ee = createE2eeSession(key.publicKey);
      e2eeInfo = { enabled: true, algo: "ed25519", version: "2", modelKeyAttested: true };
    } else {
      e2eeInfo = { enabled: false, reason: reason ?? "E2EE key unavailable" };
      if (ai.e2ee === "required") {
        emit({ type: "error", message: `End-to-end encryption is required on this deployment but unavailable: ${e2eeInfo.reason}. Nothing was sent.` });
        return;
      }
      notes.push(`End-to-end encryption unavailable (${e2eeInfo.reason}); request protected by TLS to the NEAR AI gateway, inference still runs in TEE.`);
    }
  }

  emit({ type: "meta", mode, inference: "near-ai", model: ai.model, e2ee: e2eeInfo, sources, notes, conversationId });
  emit({ type: "status", state: "processing", message: e2ee ? "Encrypted inference running inside the TEE…" : "Confidential inference running on NEAR AI Cloud…" });

  const wireMessages = e2ee ? messages.map((m) => ({ ...m, content: e2ee!.encrypt(m.content) })) : messages;
  let answer = "";
  let decryptFailures = 0;
  let result;
  try {
    result = await streamChatCompletion(
      { model: ai.model, messages: wireMessages, max_tokens: ai.maxTokens, temperature: 0.3 },
      {
        onDelta(content, field) {
          if (field !== "content") return;
          let text = content;
          if (e2ee) {
            const dec = e2ee.tryDecrypt(content);
            if (dec === null) {
              decryptFailures++;
              return; // never show undecryptable ciphertext
            }
            text = dec;
          }
          answer += text;
          emit({ type: "delta", text });
        },
      },
      e2ee ? e2ee.headers : {},
      input.signal,
    );
  } catch (err) {
    const msg = err instanceof NearAiError ? err.message : "The NEAR AI request failed.";
    emit({ type: "error", message: `${msg} Please retry in a moment.` });
    return;
  }
  if (decryptFailures > 0) log("warn", "e2ee.decrypt_failures", { count: decryptFailures });
  if (!answer.trim()) {
    emit({ type: "error", message: decryptFailures ? "The encrypted response could not be decrypted." : "The model returned an empty response." });
    return;
  }

  /* 3. Verify this exact completion: signature + fresh TEE attestation. */
  emit({ type: "status", state: "verifying", message: "Verifying signature and TEE attestation…" });
  const verification = await verifyCompletion({
    chatId: result.chatId,
    model: ai.model,
    requestBody: result.requestBody,
    rawResponse: result.rawResponse,
    preferredAlgo: e2ee ? "ed25519" : "ecdsa",
    e2ee: e2eeInfo,
  });
  emit({ type: "verification", result: verification });

  /* 4. Persist (only if the user opted to keep history). */
  let messageId: string | null = null;
  if (ctx.user && ctx.supabase) {
    const keep = input.saveHistory && (prefs?.saveChatHistory ?? true);
    if (keep) {
      try {
        if (!conversationId) conversationId = await repo.createConversation(ctx.supabase, ctx.user.id, question);
        await repo.addMessage(ctx.supabase, ctx.user.id, conversationId, "user", question, {});
        messageId = await repo.addMessage(ctx.supabase, ctx.user.id, conversationId, "assistant", answer, {
          mode,
          model: ai.model,
          e2ee: e2eeInfo.enabled,
          sources,
          verification: { ...verification, targets: verification.targets.map((t) => ({ ...t, checks: t.checks.map((c) => ({ ...c, expected: undefined, actual: undefined })) })) },
        });
      } catch {
        notes.push("Conversation could not be saved.");
      }
    }
    await repo.logProcessing(ctx.supabase, ctx.user.id, "chat", verification).catch(() => undefined);
  }
  emit({ type: "done", messageId, conversationId });
}

function dedupeSources(list: DataSource[]): DataSource[] {
  const seen = new Map<string, DataSource>();
  for (const s of list) {
    const k = `${s.name}|${s.purpose}`;
    if (!seen.has(k)) seen.set(k, s);
  }
  return [...seen.values()];
}
