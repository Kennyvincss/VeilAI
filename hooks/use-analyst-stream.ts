"use client";

import type { DataSource, VerificationResult, VerificationState } from "@/types";

export type StreamEvent =
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

/** POSTs to /api/ai/chat and dispatches each NDJSON event as it arrives. */
export async function streamAnalyst(
  body: { message: string; conversationId?: string | null; history?: { role: "user" | "assistant"; content: string }[]; saveHistory?: boolean; attachment?: { kind: "wallet_intel"; data: Record<string, unknown> } },
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* ignore */
    }
    onEvent({ type: "error", message: msg });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as StreamEvent);
      } catch {
        /* skip malformed line */
      }
    }
  }
  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer) as StreamEvent);
    } catch {
      /* ignore */
    }
  }
}
