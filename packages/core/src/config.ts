import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { RoutingConfigSchema, type RoutingConfig } from "@mottainai/router";
import { ProviderConfigSchema, type ProviderConfig } from "@mottainai/providers";

export const AppConfigSchema = RoutingConfigSchema.extend({
  providers: ProviderConfigSchema.default({}),
  systemPrompt: z
    .string()
    .default(
      "You are Mottainai, an AI coding assistant. You have access to tools for reading, writing, and editing files, running shell commands, and searching code. Use tools to investigate and modify code as needed."
    ),
  maxSteps: z.number().default(20),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

import { z } from "zod";

export function loadConfig(configPath?: string): AppConfig {
  const paths = [
    configPath,
    resolve(process.cwd(), "yoru.json"),
    resolve(process.cwd(), "yoru.jsonc"),
  ].filter(Boolean) as string[];

  for (const path of paths) {
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, "utf-8");
        const json = JSON.parse(raw);
        return AppConfigSchema.parse(json);
      } catch (error) {
        console.error(`Failed to load config from ${path}:`, error);
      }
    }
  }

  return AppConfigSchema.parse({});
}

export function createDefaultConfig(): AppConfig {
  return AppConfigSchema.parse({});
}
