import type { NextRequest } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/session";
import { addContact, listContacts, NotSetUpError, removeContact } from "@/lib/supabase/repo";
import { assertSameOrigin, HttpError, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { accountIdSchema, firstIssue } from "@/lib/security/validation";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { looksLikeSecret } from "@/lib/near/account";

const MAX_CONTACTS = 100;
const contactSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Enter a name")
    .max(40, "Name is too long")
    .refine((v) => !looksLikeSecret(v), "That looks like a secret key — never store it."),
  accountId: accountIdSchema,
});
const NOT_SET_UP = "Your contacts are saved in this browser for now.";

/** Signed-in users' encrypted address book. Visitors without an account use browser storage instead. */
export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonOk({ persisted: false, contacts: [] });
  try {
    return jsonOk({ persisted: true, contacts: await listContacts(ctx.supabase, ctx.user.id) });
  } catch (err) {
    return err instanceof NotSetUpError ? jsonOk({ persisted: false, contacts: [], notice: NOT_SET_UP }) : jsonError(500, "Could not load contacts.");
  }
}

export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonError(401, "Create a free account to sync your address book.");
  const limited = limitOrNull(`mut:${ctx.user.id}`, RATE_LIMITS.mutations);
  if (limited) return limited;
  try {
    const parsed = contactSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, firstIssue(parsed.error));
    const existing = await listContacts(ctx.supabase, ctx.user.id);
    if (existing.some((c) => c.accountId === parsed.data.accountId)) return jsonError(409, "That account is already in your address book.");
    if (existing.length >= MAX_CONTACTS) return jsonError(400, `You can save up to ${MAX_CONTACTS} contacts.`);
    const id = await addContact(ctx.supabase, ctx.user.id, parsed.data.label, parsed.data.accountId);
    return jsonOk({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.message);
    if (err instanceof NotSetUpError) return jsonError(503, NOT_SET_UP);
    return jsonError(500, "Could not save contact.");
  }
}

export async function DELETE(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonError(401, "Sign in to manage contacts.");
  const id = z.uuid().safeParse(req.nextUrl.searchParams.get("id"));
  if (!id.success) return jsonError(400, "Invalid contact id.");
  try {
    await removeContact(ctx.supabase, ctx.user.id, id.data);
    return jsonOk({ ok: true });
  } catch {
    return jsonError(500, "Could not delete contact.");
  }
}
