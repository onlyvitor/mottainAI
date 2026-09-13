import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

export const ProviderConfigSchema = z.object({
  openai: z
    .object({
      apiKey: z.string().optional(),
    })
    .optional(),
  anthropic: z
    .object({
      apiKey: z.string().optional(),
    })
    .optional(),
  google: z
    .object({
      apiKey: z.string().optional(),
    })
    .optional(),
  deepseek: z
    .object({
      apiKey: z.string().optional(),
    })
    .optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

type ModelFactory = (id: string) => any;

export interface ProviderRegistry {
  getModel(id: string): any;
}

export function createRegistry(config?: ProviderConfig): ProviderRegistry {
  const factories: Record<string, ModelFactory> = {};

  if (config?.openai?.apiKey) {
    const p = createOpenAI({ apiKey: config.openai.apiKey });
    factories["openai"] = (id) => p(id);
  }

  if (config?.anthropic?.apiKey) {
    const p = createAnthropic({ apiKey: config.anthropic.apiKey });
    factories["anthropic"] = (id) => p(id);
  }

  if (config?.google?.apiKey) {
    const p = createGoogleGenerativeAI({ apiKey: config.google.apiKey });
    factories["google"] = (id) => p(id);
  }

  if (config?.deepseek?.apiKey) {
    const p = createOpenAICompatible({
      name: "deepseek",
      apiKey: config.deepseek.apiKey,
      baseURL: "https://api.deepseek.com/v1",
    });
    factories["deepseek"] = (id) => p.chatModel(id);
  }

  return {
    getModel(modelId: string): any {
      const [provider, ...rest] = modelId.split("/");
      const id = rest.join("/") || modelId;

      const factory = factories[provider || ""];
      if (factory) {
        return factory(id);
      }

      const firstFactory = Object.values(factories)[0];
      if (firstFactory) {
        return firstFactory(modelId);
      }

      throw new Error(
        `No provider found for model "${modelId}". Set API keys for your providers.`
      );
    },
  };
}
