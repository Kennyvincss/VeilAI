import type { NextRequest } from "next/server";
import { getRequestContext } from "@/lib/session";
import { runAnalyst, type AnalystEvent } from "@/lib/ai/analyst";
import { assertSameOrigin, clientIp, HttpError, jsonError, limitOrNull, readJson } from "@/lib/security/http";
import { chatRequestSchema, firstIssue } from "@/lib/security/validation";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { log } from "@/lib/security/logger";

export const maxDuration = 120;

/**
 * Streams analyst events as NDJSON (one JSON object per line):
 * status → meta → delta* → verification → done (or error).
 */
export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ctx = await getRequestContext();
  if (!ctx.user && !ctx.demo) return jsonError(401, "Sign in or start a demo session.");
  const limited = ctx.user
    ? limitOrNull(`ai:${ctx.user.id}`, RATE_LIMITS.aiChat)
    : limitOrNull(`ai-anon:${clientIp(req)}`, RATE_LIMITS.aiChatAnonymous);
  if (limited) return limited;

  let body: ReturnType<typeof chatRequestSchema.parse>;
  try {
    const parsed = chatRequestSchema.safeParse(await readJson(req, 96 * 1024));
    if (!parsed.success) return jsonError(400, firstIssue(parsed.error));
    body = parsed.data;
  } catch (err) {
    return jsonError(err instanceof HttpError ? err.status : 400, err instanceof HttpError ? err.message : "Bad request");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (e: AnalystEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await runAnalyst({
          ctx,
          question: body.message,
          conversationId: body.conversationId ?? null,
          clientHistory: body.history ?? [],
          saveHistory: body.saveHistory ?? true,
          attachment: body.attachment,
          emit,
          signal: req.signal,
        });
      } catch (err) {
        log("error", "analyst.failed", { error: err instanceof Error ? err.message : "unknown" });
        emit({ type: "error", message: "The analyst hit an unexpected error. Please try again." });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
