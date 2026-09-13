import { z } from "zod";

export const ModelPricingSchema = z.object({
  id: z.string(),
  provider: z.string(),
  displayName: z.string(),
  inputCostPer1M: z.number(),
  outputCostPer1M: z.number(),
  contextWindow: z.number(),
  maxOutput: z.number(),
  supportsTools: z.boolean(),
  supportsVision: z.boolean(),
  tier: z.enum(["BUDGET", "MID", "PREMIUM"]),
});

export type ModelPricing = z.infer<typeof ModelPricingSchema>;

export const MODEL_CATALOG: ModelPricing[] = [
  {
    id: "deepseek-v4-flash",
    provider: "deepseek",
    displayName: "DeepSeek V4 Flash",
    inputCostPer1M: 0.14,
    outputCostPer1M: 0.28,
    contextWindow: 1_000_000,
    maxOutput: 8_192,
    supportsTools: true,
    supportsVision: false,
    tier: "BUDGET",
  },
  {
    id: "gemini-2.5-flash",
    provider: "google",
    displayName: "Gemini 2.5 Flash",
    inputCostPer1M: 0.3,
    outputCostPer1M: 2.5,
    contextWindow: 1_048_576,
    maxOutput: 8_192,
    supportsTools: true,
    supportsVision: true,
    tier: "BUDGET",
  },
  {
    id: "gemini-3.1-pro",
    provider: "google",
    displayName: "Gemini 3.1 Pro",
    inputCostPer1M: 1.38,
    outputCostPer1M: 7.88,
    contextWindow: 1_048_576,
    maxOutput: 16_384,
    supportsTools: true,
    supportsVision: true,
    tier: "MID",
  },
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    displayName: "Claude Sonnet 5",
    inputCostPer1M: 2.0,
    outputCostPer1M: 10.0,
    contextWindow: 200_000,
    maxOutput: 16_384,
    supportsTools: true,
    supportsVision: true,
    tier: "MID",
  },
  {
    id: "claude-opus-4.8",
    provider: "anthropic",
    displayName: "Claude Opus 4.8",
    inputCostPer1M: 5.0,
    outputCostPer1M: 25.0,
    contextWindow: 200_000,
    maxOutput: 32_768,
    supportsTools: true,
    supportsVision: true,
    tier: "PREMIUM",
  },
];

export function getModel(id: string): ModelPricing | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function calculateCost(
  model: ModelPricing,
  inputTokens: number,
  outputTokens: number
): number {
  const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M;
  return inputCost + outputCost;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateChatTokens(
  messages: Array<{ role: string; content: string }>
): number {
  let tokens = 0;
  for (const msg of messages) {
    tokens += 4;
    tokens += estimateTokens(msg.role);
    tokens += estimateTokens(msg.content);
  }
  tokens += 2;
  return tokens;
}
