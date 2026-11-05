"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BrainCircuit, Lock, MessageSquarePlus, Send, ShieldCheck, Square, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import type { ChatMessage, ConversationSummary, DataSource, VerificationResult, VerificationState } from "@/types";
import { api, useApi } from "@/hooks/use-api";
import { streamAnalyst } from "@/hooks/use-analyst-stream";
import { useAppStatus } from "@/components/layout/app-status";
import { PageHeader } from "@/components/layout/dashboard-shell";
import { Markdown } from "@/components/analyst/markdown";
import { SourcesList } from "@/components/dashboard/sources";
import { VerificationDetails } from "@/components/privacy/verification-details";
import { Badge, Button, Card, Toggle } from "@/components/ui/primitives";
import { ModeBadge, VerificationBadge } from "@/components/ui/status";
import { cn, timeAgo } from "@/lib/utils/format";
import { looksLikeSecret } from "@/lib/near/account";

const SUGGESTIONS = [
  "Analyse my portfolio",
  "What are my biggest financial risks?",
  "Which assets have performed poorly?",
  "Identify excessive portfolio concentration",
  "Analyse my trading behaviour",
  "Explain my recent transactions",
  "Generate a financial risk report",
];

interface UiMessage extends ChatMessage {
  pending?: boolean;
  status?: { state: VerificationState; message: string };
  inference?: "near-ai" | "demo-template";
  notes?: string[];
  error?: string;
}

const STEPS: { state: VerificationState; label: string }[] = [
  { state: "initialising", label: "Initialising" },
  { state: "processing", label: "Processing in TEE" },
  { state: "verifying", label: "Verifying attestation" },
];

export default function AnalystPage() {
  const { status } = useAppStatus();
  const signedIn = status.session.signedIn;
  const convs = useApi<{ conversations: ConversationSummary[]; persisted: boolean }>("/api/ai/conversations");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [saveHistory, setSaveHistory] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const openConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    try {
      const { messages } = await api<{ messages: ChatMessage[] }>(`/api/ai/conversations/${id}`);
      setConversationId(id);
      setMessages(messages);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open conversation");
    }
  }, []);

  function newConversation() {
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  async function deleteConversation(id: string) {
    try {
      await api(`/api/ai/conversations/${id}`, { method: "DELETE" });
      toast.success("Conversation deleted");
      if (id === conversationId) newConversation();
      void convs.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  function patchLast(fn: (m: UiMessage) => UiMessage) {
    setMessages((list) => {
      const copy = [...list];
      const i = copy.length - 1;
      if (i >= 0 && copy[i].role === "assistant") copy[i] = fn(copy[i]);
      return copy;
    });
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    if (looksLikeSecret(message)) {
      setInput("");
      toast.error("That looks like a seed phrase or private key. It was NOT sent. Never share it with anyone.");
      return;
    }
    const history = messages.filter((m) => !m.error && !m.pending).slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const now = new Date().toISOString();
    setMessages((m) => [
      ...m,
      { id: `u-${now}`, role: "user", content: message, createdAt: now },
      { id: `a-${now}`, role: "assistant", content: "", createdAt: now, pending: true, status: { state: "initialising", message: "Preparing…" } },
    ]);
    setInput("");
    setStreaming(true);
    abortRef.current = new AbortController();
    let sources: DataSource[] = [];
    try {
      await streamAnalyst(
        { message, conversationId, history: signedIn ? undefined : history, saveHistory },
        (e) => {
          switch (e.type) {
            case "status":
              patchLast((m) => ({ ...m, status: { state: e.state, message: e.message } }));
              break;
            case "meta":
              sources = e.sources;
              patchLast((m) => ({ ...m, inference: e.inference, notes: e.notes, meta: { ...m.meta, mode: e.mode, model: e.model ?? undefined, sources: e.sources, e2ee: e.e2ee.enabled } }));
              break;
            case "delta":
              patchLast((m) => ({ ...m, content: m.content + e.text }));
              break;
            case "verification":
              patchLast((m) => ({ ...m, meta: { ...m.meta, verification: e.result, sources } }));
              break;
            case "done":
              patchLast((m) => ({ ...m, pending: false, id: e.messageId ?? m.id }));
              if (e.conversationId && e.conversationId !== conversationId) {
                setConversationId(e.conversationId);
                void convs.reload();
              }
              break;
            case "error":
              patchLast((m) => ({ ...m, pending: false, error: e.message }));
              break;
          }
        },
        abortRef.current.signal,
      );
    } catch (err) {
      const aborted = (err as Error).name === "AbortError";
      patchLast((m) => ({ ...m, pending: false, error: aborted ? "Stopped." : "Connection to the analyst was interrupted. Please retry." }));
    } finally {
      patchLast((m) => (m.pending ? { ...m, pending: false } : m));
      setStreaming(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <>
      <PageHeader
        title="AI Financial Analyst"
        description="Ask about your portfolio, risks and on-chain behaviour. Answers are generated by a model running inside a TEE on NEAR AI Cloud and verified per response."
        badges={status.nearAi.configured ? <Badge tone="success">NEAR AI · {status.nearAi.model}</Badge> : <Badge tone="warning">Demo mode · NEAR AI not configured</Badge>}
        actions={
          <Button variant="secondary" size="sm" onClick={newConversation}>
            <MessageSquarePlus className="h-3.5 w-3.5" /> New conversation
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Conversation history */}
        <Card className="h-fit p-3 lg:sticky lg:top-6">
          <div className="mb-2 px-2 text-[0.7rem] font-semibold uppercase tracking-wider text-subtle">History</div>
          {!signedIn ? (
            <p className="px-2 pb-2 text-xs leading-relaxed text-muted">Demo conversations are kept only in this tab and never stored. Create a free account to save history.</p>
          ) : convs.data && convs.data.conversations.length > 0 ? (
            <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto">
              {convs.data.conversations.map((c) => (
                <li key={c.id} className="group flex items-center">
                  <button
                    onClick={() => void openConversation(c.id)}
                    className={cn(
                      "min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-xs transition-colors",
                      c.id === conversationId ? "bg-accent/12 text-text" : "text-muted hover:bg-white/[0.04] hover:text-text",
                    )}
                  >
                    <div className="truncate">{c.title}</div>
                    <div className="text-[0.65rem] text-subtle">{timeAgo(c.updatedAt)}</div>
                  </button>
                  <button
                    onClick={() => void deleteConversation(c.id)}
                    className="ml-1 rounded-md p-1.5 text-subtle opacity-100 transition hover:bg-danger/10 hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                    aria-label={`Delete conversation ${c.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 pb-2 text-xs text-muted">{convs.loading ? "Loading…" : "No saved conversations yet."}</p>
          )}
          {signedIn && (
            <div className="mt-3 border-t border-border px-2 pt-3">
              <Toggle id="save-history" checked={saveHistory} onChange={setSaveHistory} label="Save history" description="Encrypted, only visible to you. Off = nothing stored." />
            </div>
          )}
        </Card>

        {/* Chat */}
        <Card className="flex min-h-[70vh] flex-col p-0">
          <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" aria-live="polite">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent-strong">
                  <BrainCircuit className="h-6 w-6" />
                </div>
                <h2 className="mt-5 text-lg font-semibold">What would you like to understand?</h2>
                <p className="mt-2 max-w-md text-sm text-muted">
                  Your context is pseudonymised before it leaves the server{status.nearAi.e2eeMode !== "off" ? " and end-to-end encrypted to an attested enclave when available" : ""}.
                </p>
                <div className="mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => void send(s)} className="rounded-full border border-border-strong bg-bg-2/60 px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-accent/40 hover:text-text">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
                    {m.role === "assistant" && (
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent-strong">
                        <BrainCircuit className="h-4 w-4" />
                      </div>
                    )}
                    {m.role === "user" ? (
                      <div className="flex max-w-[85%] items-start gap-2">
                        <div className="rounded-2xl rounded-tr-md bg-accent/90 px-4 py-2.5 text-sm text-white">{m.content}</div>
                        <div className="mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-muted sm:flex">
                          <User className="h-4 w-4" />
                        </div>
                      </div>
                    ) : (
                      <AssistantMessage m={m} />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={onSubmit} className="border-t border-border p-3 sm:p-4">
            <div className="flex items-end gap-2 rounded-2xl border border-border-strong bg-bg-2 p-2 focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/20">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                rows={1}
                maxLength={4000}
                placeholder="Ask about your portfolio, risks or transactions…"
                aria-label="Message the analyst"
                className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-text placeholder:text-subtle focus:outline-none"
              />
              {streaming ? (
                <Button type="button" size="icon" variant="secondary" onClick={() => abortRef.current?.abort()} aria-label="Stop generating">
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send">
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="mt-2 px-1 text-[0.68rem] text-subtle">Informational only — not financial advice. Never paste seed phrases or private keys.</p>
          </form>
        </Card>
      </div>
    </>
  );
}

function AssistantMessage({ m }: { m: UiMessage }) {
  const v: VerificationResult | null | undefined = m.meta?.verification;
  const currentStep = m.status?.state;
  return (
    <div className="min-w-0 max-w-[92%] flex-1 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {m.meta?.mode && <ModeBadge mode={m.meta.mode} />}
        {m.inference === "demo-template" && <Badge tone="warning">Template response · not NEAR AI</Badge>}
        {m.inference === "near-ai" && <Badge tone="accent">NEAR AI · {m.meta?.model}</Badge>}
        {m.meta?.e2ee && (
          <Badge tone="blue">
            <Lock className="h-3 w-3" /> E2EE
          </Badge>
        )}
        {v && <VerificationBadge state={v.state} />}
      </div>

      {m.pending && !m.content && (
        <div className="rounded-2xl border border-border bg-bg-2/50 p-4">
          <ol className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
            {STEPS.map((s) => {
              const idx = STEPS.findIndex((x) => x.state === currentStep);
              const mine = STEPS.findIndex((x) => x.state === s.state);
              const active = mine === idx;
              const done = mine < idx;
              return (
                <li key={s.state} className={cn("flex items-center gap-1.5", active ? "text-text" : done ? "text-success" : "text-subtle")}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-accent animate-pulse-soft" : done ? "bg-success" : "bg-subtle")} />
                  {s.label}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[0.7rem] text-subtle">{m.status?.message}</p>
        </div>
      )}

      {m.content && (
        <div className="rounded-2xl rounded-tl-md border border-border bg-bg-2/50 px-4 py-3">
          <Markdown>{m.content}</Markdown>
          {m.pending && <span className="inline-block h-4 w-1.5 animate-pulse bg-accent-strong align-middle" aria-hidden />}
        </div>
      )}

      {m.error && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {m.error}
        </p>
      )}

      {m.pending && m.content && m.status?.state === "verifying" && (
        <p className="flex items-center gap-1.5 text-[0.7rem] text-[#93c5fd]">
          <ShieldCheck className="h-3.5 w-3.5" /> {m.status.message}
        </p>
      )}

      {!m.pending && m.meta?.sources && m.meta.sources.length > 0 && (
        <div>
          <div className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-subtle">Sources</div>
          <SourcesList sources={m.meta.sources} />
        </div>
      )}
      {!m.pending && m.notes && m.notes.length > 0 && (
        <ul className="text-[0.68rem] text-subtle">
          {m.notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      )}
      {v && (
        <details className="group rounded-xl border border-border bg-bg-2/30 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted hover:text-text">
            <ShieldCheck className="h-3.5 w-3.5 text-accent-strong" /> Verification details
          </summary>
          <div className="mt-3">
            <VerificationDetails result={v} compact />
          </div>
        </details>
      )}
    </div>
  );
}
