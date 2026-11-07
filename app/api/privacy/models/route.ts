import { listModels } from "@/lib/near-ai/client";
import { nearAiConfig } from "@/lib/env";
import { jsonOk } from "@/lib/security/http";
import { log } from "@/lib/security/logger";

/** NEAR AI Cloud model catalogue (public endpoint) + the configured model. */
export async function GET() {
  const cfg = nearAiConfig();
  try {
    const models = await listModels();
    return jsonOk(
      { configuredModel: cfg.model, models: models.slice(0, 100).map((m) => ({ id: m.id })), available: models.some((m) => m.id === cfg.model) },
      { cache: "private, max-age=300" },
    );
  } catch (err) {
    log("warn", "near_ai.models_unavailable", { hint: err instanceof Error ? err.message : "unknown" });
    return jsonOk({ configuredModel: cfg.model, models: [], available: null, error: "unavailable" });
  }
}
