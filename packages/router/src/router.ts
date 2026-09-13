import { z } from "zod";
import { type ComplexityTier, classifyComplexity } from "./scorer";
import {
  MODEL_CATALOG,
  type ModelPricing,
  calculateCost,
  estimateChatTokens,
} from "./pricing";
import { CircuitBreaker } from "./circuit-breaker";

export const RoutingRuleSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(true),
  priority: z.number().default(0),
  match: z.object({
    promptContains: z.array(z.string()).optional(),
    promptRegex: z.array(z.string()).optional(),
    tier: z.array(z.string()).optional(),
  }),
  action: z.object({
    routeTo: z.string().optional(),
    tier: z.enum(["SIMPLE", "MEDIUM", "COMPLEX", "REASONING"]).optional(),
    maxCost: z.number().optional(),
    fallback: z.array(z.string()).optional(),
  }),
});

export type RoutingRule = z.infer<typeof RoutingRuleSchema>;

export const RoutingConfigSchema = z.object({
  defaults: z
    .object({
      tier: z
        .enum(["SIMPLE", "MEDIUM", "COMPLEX", "REASONING"])
        .default("MEDIUM"),
      model: z.string().optional(),
      budget: z
        .object({
          dailyUsd: z.number().default(10),
          perRequestUsd: z.number().default(0.1),
        })
        .default({}),
    })
    .default({}),
  rules: z.array(RoutingRuleSchema).default([]),
  blocked: z.array(z.string()).default([]),
  fallback: z.array(z.string()).default([
    "gemini-2.5-flash",
    "deepseek-v4-flash",
  ]),
});

export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;

export interface RoutingRequest {
  messages: Array<{ role: string; content: string }>;
  needsTools?: boolean;
  needsVision?: boolean;
}

export interface RoutingDecision {
  tier: ComplexityTier;
  model: ModelPricing;
  estimatedCost: number;
  fallback: string[];
  reason: string;
}

export class LLMRouter {
  private config: RoutingConfig;
  private breakers: Map<string, CircuitBreaker> = new Map();

  constructor(config?: Partial<RoutingConfig>) {
    this.config = RoutingConfigSchema.parse(config || {});

    for (const model of MODEL_CATALOG) {
      this.breakers.set(model.id, new CircuitBreaker());
    }
  }

  route(request: RoutingRequest): RoutingDecision {
    const prompt = request.messages.map((m) => m.content).join("\n");
    const { tier, confidence, rawScore } = classifyComplexity(prompt);

    for (const rule of this.config.rules
      .filter((r) => r.enabled)
      .sort((a, b) => b.priority - a.priority)) {
      if (this.matchesRule(prompt, tier, rule)) {
        return this.applyRule(rule, request, tier, rawScore, confidence);
      }
    }

    return this.selectByTier(request, tier, rawScore, confidence);
  }

  private matchesRule(
    prompt: string,
    tier: ComplexityTier,
    rule: RoutingRule
  ): boolean {
    const m = rule.match;

    if (m.tier && !m.tier.includes(tier)) return false;

    if (m.promptContains?.length) {
      const lower = prompt.toLowerCase();
      if (!m.promptContains.some((kw) => lower.includes(kw.toLowerCase())))
        return false;
    }

    if (m.promptRegex?.length) {
      if (!m.promptRegex.some((rx) => new RegExp(rx, "i").test(prompt)))
        return false;
    }

    return true;
  }

  private applyRule(
    rule: RoutingRule,
    request: RoutingRequest,
    tier: ComplexityTier,
    rawScore: number,
    confidence: number
  ): RoutingDecision {
    const targetTier = rule.action.tier || tier;
    const modelId = rule.action.routeTo;

    let model: ModelPricing;
    if (modelId) {
      const found = MODEL_CATALOG.find((m) => m.id === modelId);
      if (!found) {
        return this.selectByTier(request, targetTier, rawScore, confidence);
      }
      model = found;
    } else {
      model = this.pickCheapestCapable(targetTier, request);
    }

    const inputTokens = estimateChatTokens(request.messages);
    const estimatedCost = calculateCost(model, inputTokens, 512);

    return {
      tier: targetTier,
      model,
      estimatedCost,
      fallback: rule.action.fallback || this.config.fallback,
      reason: `Rule "${rule.name}" matched`,
    };
  }

  private selectByTier(
    request: RoutingRequest,
    tier: ComplexityTier,
    rawScore: number,
    confidence: number
  ): RoutingDecision {
    const model = this.pickCheapestCapable(tier, request);
    const inputTokens = estimateChatTokens(request.messages);
    const estimatedCost = calculateCost(model, inputTokens, 512);

    return {
      tier,
      model,
      estimatedCost,
      fallback: this.config.fallback,
      reason: `Complexity scoring: ${tier} (score=${rawScore.toFixed(3)}, conf=${confidence.toFixed(3)})`,
    };
  }

  private pickCheapestCapable(
    tier: ComplexityTier,
    request: RoutingRequest
  ): ModelPricing {
    const tierMap: Record<ComplexityTier, ModelPricing["tier"][]> = {
      SIMPLE: ["BUDGET"],
      MEDIUM: ["BUDGET", "MID"],
      COMPLEX: ["BUDGET", "MID", "PREMIUM"],
      REASONING: ["MID", "PREMIUM"],
    };

    const allowedTiers = tierMap[tier];

    const candidates = MODEL_CATALOG.filter((m) => {
      if (this.config.blocked.includes(m.id)) return false;
      if (!allowedTiers.includes(m.tier)) return false;
      if (request.needsTools && !m.supportsTools) return false;
      if (request.needsVision && !m.supportsVision) return false;
      if (!this.breakers.get(m.id)?.isAvailable()) return false;
      return true;
    });

    if (candidates.length === 0) {
      return MODEL_CATALOG[0]!;
    }

    return candidates.sort(
      (a, b) => a.inputCostPer1M - b.inputCostPer1M
    )[0]!;
  }

  getBreaker(modelId: string): CircuitBreaker | undefined {
    return this.breakers.get(modelId);
  }
}
