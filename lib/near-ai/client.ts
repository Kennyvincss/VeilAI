import "server-only";
import { nearAiConfig } from "@/lib/env";
import { log } from "@/lib/security/logger";

/**
 * NEAR AI Cloud client.
 *
 * Endpoints (OpenAI-compatible gateway, github.com/nearai/cloud-api):
 *   GET  /v1/models                          public model catalogue
 *   POST /v1/chat/completions                inference (SSE when stream=true)
 *   GET  /v1/attestation/report              TEE attestation (API key)
 *   GET  /v1/signature/{chat_id}             per-completion signature (API key)
 *
 * Authentication: `Authorization: Bearer <NEAR_AI_API_KEY>` — server-side
 * only. The key is never sent to the browser.
 */

export class NearAiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code: "not_configured" | "http" | "timeout" | "network" | "protocol" = "http",
  ) {
    super(message);
  }
}

/**
 * Operator-facing diagnosis of a NEAR AI failure (what to fix). Written to
 * server logs only — never shown to end users, because it names
 * configuration and account details.
 */
export function nearAiOperatorHint(err: unknown): string {
  if (!(err instanceof NearAiError)) return err instanceof Error ? err.message : "unknown error";
  const detail = err.message;
  switch (true) {
    case err.code === "not_configured":
      return "NEAR_AI_API_KEY is not set.";
    case err.status === 402:
      return "NEAR AI account has no credits or spending limit (HTTP 402). Add credits at cloud.near.ai.";
    case err.status === 401 || err.status === 403:
      return "NEAR AI rejected the API key (check NEAR_AI_API_KEY).";
    case err.status === 400 && /model/i.test(detail) && /not (found|a valid)/i.test(detail):
      return `${detail} Set NEAR_AI_MODEL to a NEAR-hosted TEE model.`;
    default:
      return detail;
  }
}

/**
 * End-user message for a NEAR AI failure: calm, actionable for the user,
 * and free of configuration or account details (those go to the server log
 * via nearAiOperatorHint).
 */
export function explainNearAiError(err: unknown): string {
  if (!(err instanceof NearAiError)) return "The AI analyst could not complete this request. Please try again.";
  switch (true) {
    case err.status === 429:
      return "The AI service is busy right now. Please wait a moment and try again.";
    case err.code === "timeout" || err.code === "network" || (err.status !== undefined && err.status >= 500):
      return "The AI service could not be reached. Please try again shortly.";
    default:
      return "Live AI analysis is temporarily unavailable. Please try again later.";
  }
}

function requireKey(): string {
  const { apiKey } = nearAiConfig();
  if (!apiKey) throw new NearAiError("NEAR AI Cloud is not configured (NEAR_AI_API_KEY missing).", undefined, "not_configured");
  return apiKey;
}

async function request(path: string, init: RequestInit & { timeoutMs?: number; auth?: boolean } = {}): Promise<Response> {
  const { baseUrl } = nearAiConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  const headers = new Headers(init.headers);
  if (init.auth !== false) headers.set("Authorization", `Bearer ${requireKey()}`);
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers, signal: init.signal ?? controller.signal, cache: "no-store" });
    log(res.ok ? "info" : "warn", "near_ai.request", {
      path: path.split("?")[0].replace(/\/v1\/signature\/.+$/, "/v1/signature/:id"),
      status: res.status,
      ms: Date.now() - started,
    });
    return res;
  } catch (err) {
    const timeout = err instanceof Error && err.name === "AbortError";
    log("warn", "near_ai.request_failed", { path: path.split("?")[0], timeout });
    throw new NearAiError(timeout ? "NEAR AI Cloud request timed out" : "Could not reach NEAR AI Cloud", undefined, timeout ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } | string; message?: string };
      detail = typeof body.error === "string" ? body.error : (body.error?.message ?? body.message ?? "");
    } catch {
      /* non-JSON error */
    }
    throw new NearAiError(`NEAR AI Cloud responded ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`, res.status);
  }
  return (await res.json()) as T;
}

/* ---------------- models ---------------- */

export interface NearAiModel {
  id: string;
  object?: string;
  owned_by?: string;
  [k: string]: unknown;
}

export async function listModels(): Promise<NearAiModel[]> {
  const res = await request("/v1/models", { auth: Boolean(nearAiConfig().apiKey), timeoutMs: 15_000 });
  const body = await json<{ data?: NearAiModel[]; models?: NearAiModel[] }>(res);
  const list = body.data ?? body.models ?? [];
  return Array.isArray(list) ? list : [];
}

/* ---------------- attestation ---------------- */

export interface RawAttestation {
  signing_address: string;
  signing_algo?: string;
  signing_public_key?: string;
  intel_quote: string;
  nvidia_payload?: string;
  tls_cert_fingerprint?: string;
  model_name?: string;
  info?: { tcb_info?: string | Record<string, unknown> } & Record<string, unknown>;
  [k: string]: unknown;
}

export interface AttestationReportResponse {
  gateway_attestation?: RawAttestation;
  model_attestations?: RawAttestation[];
  signing_address?: string;
  intel_quote?: string;
  [k: string]: unknown;
}

export async function fetchAttestationReport(params: {
  model: string;
  nonce: string;
  signingAlgo: "ecdsa" | "ed25519";
  signingAddress?: string;
}): Promise<AttestationReportResponse> {
  const q = new URLSearchParams({ model: params.model, nonce: params.nonce, signing_algo: params.signingAlgo });
  if (params.signingAddress) q.set("signing_address", params.signingAddress);
  const res = await request(`/v1/attestation/report?${q.toString()}`, { timeoutMs: 30_000 });
  return json<AttestationReportResponse>(res);
}

/* ---------------- signatures ---------------- */

export interface SignaturePayload {
  text: string;
  signature: string;
  signing_address: string;
  signing_algo?: string;
}

export async function fetchSignature(chatId: string, model: string, signingAlgo: "ecdsa" | "ed25519"): Promise<SignaturePayload> {
  const q = new URLSearchParams({ model, signing_algo: signingAlgo });
  const res = await request(`/v1/signature/${encodeURIComponent(chatId)}?${q.toString()}`, { timeoutMs: 15_000 });
  return json<SignaturePayload>(res);
}

/* ---------------- inference ---------------- */

export interface ChatMessageIn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionStreamHandlers {
  /** Called with each raw `delta.content` string (possibly ciphertext under E2EE). */
  onDelta: (content: string, field: "content" | "reasoning_content") => void;
}

export interface CompletionResult {
  chatId: string | null;
  /** The exact request body string sent — needed for signature verification. */
  requestBody: string;
  /** The exact raw response text received — needed for signature verification. */
  rawResponse: string;
  finishReason: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/**
 * Streams a chat completion. The request body is serialised exactly once
 * and the raw SSE text is accumulated byte-for-byte, because NEAR AI signs
 * `sha256(request_body):sha256(response_text)`.
 */
export async function streamChatCompletion(
  body: { model: string; messages: ChatMessageIn[]; max_tokens: number; temperature?: number },
  handlers: CompletionStreamHandlers,
  extraHeaders: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<CompletionResult> {
  const requestBody = JSON.stringify({ ...body, stream: true });
  const res = await request("/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...extraHeaders },
    body: requestBody,
    timeoutMs: 120_000,
    signal,
  });
  if (!res.ok || !res.body) {
    await json(res); // throws a NearAiError with details
    throw new NearAiError("Empty response body from NEAR AI Cloud", res.status, "protocol");
  }

  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let raw = "";
  let buffer = "";
  let chatId: string | null = null;
  let finishReason: string | null = null;
  let usage: CompletionResult["usage"];

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (data === "[DONE]") return;
    let chunk: {
      id?: string;
      choices?: { delta?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string | null }[];
      usage?: CompletionResult["usage"];
      error?: { message?: string };
    };
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    if (chunk.error) throw new NearAiError(`NEAR AI stream error: ${chunk.error.message ?? "unknown"}`, undefined, "protocol");
    if (!chatId && chunk.id) chatId = chunk.id;
    if (chunk.usage) usage = chunk.usage;
    for (const choice of chunk.choices ?? []) {
      const d = choice.delta ?? {};
      if (typeof d.content === "string" && d.content) handlers.onDelta(d.content, "content");
      if (typeof d.reasoning_content === "string" && d.reasoning_content) handlers.onDelta(d.reasoning_content, "reasoning_content");
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    raw += text;
    buffer += text;
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      handleLine(line);
    }
  }
  const tail = decoder.decode();
  raw += tail;
  buffer += tail;
  if (buffer) handleLine(buffer);

  return { chatId, requestBody, rawResponse: raw, finishReason, usage };
}

/** Non-streaming completion (used for report summaries). */
export async function chatCompletion(
  body: { model: string; messages: ChatMessageIn[]; max_tokens: number; temperature?: number },
  extraHeaders: Record<string, string> = {},
): Promise<CompletionResult & { content: string; reasoning?: string }> {
  const requestBody = JSON.stringify({ ...body, stream: false });
  const res = await request("/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: requestBody,
    timeoutMs: 120_000,
  });
  if (!res.ok) await json(res);
  const rawResponse = await res.text();
  let parsed: {
    id?: string;
    choices?: { message?: { content?: string; reasoning_content?: string }; finish_reason?: string }[];
    usage?: CompletionResult["usage"];
  };
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    throw new NearAiError("Malformed completion response", res.status, "protocol");
  }
  return {
    chatId: parsed.id ?? null,
    requestBody,
    rawResponse,
    finishReason: parsed.choices?.[0]?.finish_reason ?? null,
    usage: parsed.usage,
    content: parsed.choices?.[0]?.message?.content ?? "",
    reasoning: parsed.choices?.[0]?.message?.reasoning_content,
  };
}
