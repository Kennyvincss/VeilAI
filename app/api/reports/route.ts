import type { NextRequest } from "next/server";
import type { FinancialReport, VerificationResult } from "@/types";
import { getRequestContext } from "@/lib/session";
import { resolvePortfolio } from "@/lib/portfolio/resolve";
import { liveRiskAnalysis } from "@/lib/risk/service";
import { investigateWallet } from "@/lib/wallet-intel/service";
import { demoRiskAnalysis, demoWalletReport } from "@/lib/demo/data";
import { aiSummaryReport, portfolioReport, riskReport, walletReport } from "@/lib/reports/build";
import { listReports, logProcessing, saveReport } from "@/lib/supabase/repo";
import { assertSameOrigin, clientIp, HttpError, jsonError, jsonOk, limitOrNull, readJson } from "@/lib/security/http";
import { firstIssue, reportRequestSchema } from "@/lib/security/validation";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { getAppStatus, nearAiConfig } from "@/lib/env";
import { chatCompletion } from "@/lib/near-ai/client";
import { verifyCompletion } from "@/lib/near-ai/verify";
import { REPORT_SUMMARY_PROMPT, ANALYST_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { dataBlock } from "@/lib/security/prompt-guard";
import { log } from "@/lib/security/logger";

export const maxDuration = 90;

export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx.user || !ctx.supabase) return jsonOk({ reports: [], persisted: false });
  try {
    return jsonOk({ reports: await listReports(ctx.supabase, ctx.user.id), persisted: true });
  } catch {
    return jsonError(500, "Could not load reports.");
  }
}

export async function POST(req: NextRequest) {
  if (!assertSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const ctx = await getRequestContext();
  if (!ctx.user && !ctx.demo) return jsonError(401, "Sign in or start a demo session.");
  const limited = limitOrNull(`reports:${ctx.user?.id ?? clientIp(req)}`, RATE_LIMITS.reports);
  if (limited) return limited;

  try {
    const parsed = reportRequestSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, firstIssue(parsed.error));
    const { type, accountId, save } = parsed.data;
    let report: FinancialReport;

    if (type === "wallet") {
      if (!accountId) return jsonError(400, "Enter an account to investigate.");
      report = walletReport(ctx.user ? await investigateWallet(accountId) : demoWalletReport(accountId));
    } else {
      const portfolio = await resolvePortfolio(ctx);
      if (type === "portfolio") report = portfolioReport(portfolio);
      else {
        const risk = ctx.user ? await liveRiskAnalysis(portfolio) : demoRiskAnalysis();
        if (type === "risk") report = riskReport(risk);
        else {
          const base = [portfolioReport(portfolio), riskReport(risk)];
          const { summary, verification, inference } = await aiSummary(base, ctx.user !== null);
          report = aiSummaryReport(base, summary, verification, portfolio.provenance.mode, inference);
          if (verification && ctx.user && ctx.supabase) await logProcessing(ctx.supabase, ctx.user.id, "report", verification).catch(() => undefined);
        }
      }
    }

    if (save && ctx.user && ctx.supabase) {
      report.id = (await saveReport(ctx.supabase, ctx.user.id, report)) ?? undefined;
    }
    return jsonOk(report);
  } catch (err) {
    if (err instanceof HttpError) return jsonError(err.status, err.message);
    log("error", "report.failed", { error: err instanceof Error ? err.message : "unknown" });
    return jsonError(502, "Could not generate the report — a data provider may be unavailable.");
  }
}

async function aiSummary(base: FinancialReport[], signedIn: boolean): Promise<{ summary: string; verification: VerificationResult | null; inference: string }> {
  const ai = nearAiConfig();
  if (!ai.configured || (!signedIn && !getAppStatus().demoAllowsLiveAi)) {
    return {
      summary: "AI summary unavailable: NEAR AI Cloud is not configured on this deployment, so no AI-generated text is included. The tables below contain the full factual report.",
      verification: null,
      inference: "not generated",
    };
  }
  const data = base.map((r) => ({ title: r.title, sections: r.sections.map((s) => ({ heading: s.heading, body: s.body, rows: s.table?.rows.slice(0, 20), columns: s.table?.columns })) }));
  const res = await chatCompletion({
    model: ai.model,
    max_tokens: 500,
    temperature: 0.2,
    messages: [
      { role: "system", content: `${ANALYST_SYSTEM_PROMPT}\n\n${REPORT_SUMMARY_PROMPT}` },
      { role: "user", content: `Summarise this report data.\n\n${dataBlock("report", data)}` },
    ],
  });
  let alternate: string[] = [];
  try {
    alternate = [JSON.stringify(JSON.parse(res.rawResponse))];
  } catch {
    alternate = [];
  }
  const verification = await verifyCompletion({
    chatId: res.chatId,
    model: ai.model,
    requestBody: res.requestBody,
    rawResponse: res.rawResponse,
    responseAlternates: alternate,
    preferredAlgo: "ecdsa",
    e2ee: { enabled: false, reason: "Report summaries are sent over TLS to the NEAR AI gateway and processed in the TEE." },
  });
  return { summary: res.content.trim() || "The model returned an empty summary.", verification, inference: `NEAR AI · ${ai.model}` };
}
