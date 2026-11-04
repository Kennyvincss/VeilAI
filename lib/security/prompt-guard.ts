/**
 * Prompt-injection defences.
 *
 * VEIL AI feeds the model two kinds of text:
 *  1. The user's own question (trusted intent, untrusted content).
 *  2. Data retrieved from blockchains and market APIs (fully untrusted:
 *     token names, memos, method names and function-call args can be
 *     authored by anyone on-chain).
 *
 * Defences applied here:
 *  - Untrusted data is sanitised (control chars stripped, length capped,
 *    delimiter-like sequences neutralised) and wrapped in clearly delimited
 *    <data> blocks that the system prompt instructs the model to treat as
 *    inert data.
 *  - The user question is screened for well-known injection phrasing; when
 *    detected the request still proceeds, but the model is reminded of its
 *    constraints and the event is counted (never logged verbatim).
 *  - Model output is post-processed by the UI as plain text/markdown only —
 *    it is never executed or rendered as raw HTML.
 */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

/** Sanitise a single untrusted string for inclusion in a prompt. */
export function sanitizeUntrusted(value: unknown, maxLen = 120): string {
  if (value === null || value === undefined) return "";
  let s = String(value).replace(CONTROL_CHARS, "");
  // Neutralise our own delimiters and common chat-template markers.
  s = s
    .replace(/<\/?\s*(data|system|assistant|user|instructions?)[^>]*>/gi, "[tag removed]")
    .replace(/<\|[^|]{0,40}\|>/g, "[token removed]")
    .replace(/```/g, "ˋˋˋ");
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…`;
  return s;
}

/** Recursively sanitise every string in a JSON-like structure. */
export function sanitizeDeep<T>(value: T, maxLen = 120, depth = 0): T {
  if (depth > 6) return null as T;
  if (typeof value === "string") return sanitizeUntrusted(value, maxLen) as T;
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => sanitizeDeep(v, maxLen, depth + 1)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[sanitizeUntrusted(k, 40)] = sanitizeDeep(v, maxLen, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** Wrap untrusted data in a delimited block the system prompt refers to. */
export function dataBlock(name: string, data: unknown): string {
  const safeName = name.replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "data";
  return `<data name="${safeName}">\n${JSON.stringify(sanitizeDeep(data), null, 0)}\n</data>`;
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all|any|the|previous|prior|above)[\s\w]{0,20}(instructions|rules|prompts?)/i,
  /disregard (all|any|the|previous|prior|above)/i,
  /(reveal|print|show|repeat|output)[\s\w]{0,20}(system prompt|instructions|hidden prompt|api key|secret)/i,
  /you are now (?!analys)/i,
  /\bdeveloper mode\b|\bjailbreak\b|\bDAN\b/i,
  /<\|?(im_start|system|endoftext)\|?>/i,
  /act as (?:an? )?(?:unfiltered|unrestricted)/i,
];

export interface InjectionScreen {
  suspicious: boolean;
  matched: number;
}

export function screenUserInput(text: string): InjectionScreen {
  let matched = 0;
  for (const p of INJECTION_PATTERNS) if (p.test(text)) matched += 1;
  return { suspicious: matched > 0, matched };
}

/** Clean user text without changing meaning (strip invisible/bidi chars). */
export function cleanUserText(text: string): string {
  return text.replace(CONTROL_CHARS, "").trim();
}
