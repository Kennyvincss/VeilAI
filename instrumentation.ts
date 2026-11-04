/**
 * Runs once when the Next.js server starts. Validates configuration and
 * prints actionable guidance for anything missing — without ever printing
 * secret values.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { configurationReport } = await import("@/lib/env");
  const report = configurationReport();
  if (report.length === 0) {
    console.info("[veil] configuration OK — live mode enabled for all integrations.");
    return;
  }
  console.warn("[veil] configuration notes:");
  for (const line of report) console.warn(`  • ${line}`);
}
