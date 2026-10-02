import { createAdminClient } from "@/lib/supabase/admin";

/** Precios USD por token (input / output) */
export const MODEL_PRICING = {
  "claude-haiku-4-5-20251001": {
    input: 0.8 / 1_000_000,
    output: 4.0 / 1_000_000,
  },
  "claude-haiku-4-5": {
    input: 0.8 / 1_000_000,
    output: 4.0 / 1_000_000,
  },
  "claude-sonnet-4-6": {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
  },
  "claude-sonnet-4-5-20250929": {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
  },
  "claude-sonnet-4-5": {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
  },
  "claude-opus-4-5": {
    input: 15.0 / 1_000_000,
    output: 75.0 / 1_000_000,
  },
  /** Alias cortos usados en UI legacy */
  "claude-haiku": {
    input: 0.8 / 1_000_000,
    output: 4.0 / 1_000_000,
  },
  "claude-sonnet": {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
  },
  "claude-opus": {
    input: 15.0 / 1_000_000,
    output: 75.0 / 1_000_000,
  },
} as const;

export type TokenUsageModel = keyof typeof MODEL_PRICING;

export type TokenUsageParams = {
  /** `null` = trabajo de plataforma (super-admin), no de una organización. */
  organizationId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  feature?: string;
  /** Descuento sobre el precio de lista; el Batch API de Anthropic cobra la mitad (0.5). */
  costMultiplier?: number;
};

export function resolvePricingModel(model: string): TokenUsageModel {
  if (model in MODEL_PRICING) {
    return model as TokenUsageModel;
  }
  if (model.includes("haiku")) return "claude-haiku-4-5-20251001";
  if (model.includes("opus")) return "claude-opus-4-5";
  if (model.includes("sonnet")) return "claude-sonnet-4-6";
  return "claude-haiku-4-5-20251001";
}

export function computeTokenCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheCreationTokens = 0
): { inputCost: number; outputCost: number; totalCost: number } {
  const pricingKey = resolvePricingModel(model);
  const pricing = MODEL_PRICING[pricingKey];

  const regularInput = Math.max(
    0,
    inputTokens - cacheReadTokens - cacheCreationTokens
  );
  const inputCost =
    regularInput * pricing.input +
    cacheReadTokens * pricing.input * 0.1 +
    cacheCreationTokens * pricing.input * 1.25;
  const outputCost = outputTokens * pricing.output;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

/** Registrar uso de tokens con el modelo lógico usado (ej. claude-sonnet-4-6). */
export async function trackTokenUsage({
  organizationId,
  model,
  inputTokens,
  outputTokens,
  cacheReadTokens = 0,
  cacheCreationTokens = 0,
  feature,
  costMultiplier = 1,
}: TokenUsageParams): Promise<void> {
  const listPrice = computeTokenCostUsd(
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens
  );
  const inputCost = listPrice.inputCost * costMultiplier;
  const outputCost = listPrice.outputCost * costMultiplier;
  const totalCost = listPrice.totalCost * costMultiplier;

  const admin = createAdminClient();
  const { error } = await admin.from("token_usage").insert({
    organization_id: organizationId,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_input_tokens: cacheReadTokens,
    cache_creation_input_tokens: cacheCreationTokens,
    input_cost_usd: inputCost,
    output_cost_usd: outputCost,
    total_cost_usd: totalCost,
    feature: feature ?? null,
  });

  if (error) {
    console.error("[trackTokenUsage]", error.message);
    throw new Error(error.message);
  }
}
