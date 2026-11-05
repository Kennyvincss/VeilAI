import { listModels } from "@/lib/near-ai/client";
import { nearAiConfig } from "@/lib/env";
import { jsonOk } from "@/lib/security/http";

/** NEAR AI Cloud model catalogue (public endpoint) + the configured model. */
export async function GET() {
  const cfg = nearAiConfig();
  try {
    const models = await listModels();
    return jsonOk(
      { configuredModel: cfg.model, baseUrl: cfg.baseUrl, models: models.slice(0, 100), available: models.some((m) => m.id === cfg.model) },
      { cache: "private, max-age=300" },
    );
  } catch (err) {
    return jsonOk({ configuredModel: cfg.model, baseUrl: cfg.baseUrl, models: [], available: null, error: err instanceof Error ? err.message : "unavailable" });
  }
}
