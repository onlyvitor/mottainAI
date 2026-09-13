#!/usr/bin/env bun
import { Agent } from "@mottainai/core";
import { LLMRouter } from "@mottainai/router";
import { createRegistry } from "@mottainai/providers";
import { loadConfig } from "@mottainai/core";
import * as readline from "node:readline";

const config = loadConfig();

const registry = createRegistry({
  openai: config.providers?.openai?.apiKey
    ? { apiKey: config.providers.openai.apiKey }
    : undefined,
  anthropic: config.providers?.anthropic?.apiKey
    ? { apiKey: config.providers.anthropic.apiKey }
    : undefined,
  google: config.providers?.google?.apiKey
    ? { apiKey: config.providers.google.apiKey }
    : undefined,
  deepseek: config.providers?.deepseek?.apiKey
    ? { apiKey: config.providers.deepseek.apiKey }
    : undefined,
});

const router = new LLMRouter(config);

console.log("\n  \x1b[36mMottainai\x1b[0m — AI coding assistant with cost routing\n");
console.log("  Type your message. Ctrl+C to exit.\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const agent = new Agent(registry, router, config);

function prompt() {
  rl.question("\x1b[32m>\x1b[0m ", async (input) => {
    if (!input.trim()) {
      prompt();
      return;
    }

    try {
      for await (const event of agent.run(input)) {
        switch (event.type) {
          case "routing":
            console.log(
              `\n  \x1b[90m→ ${event.data.model.displayName} (${event.data.tier})\x1b[0m`
            );
            break;
          case "text":
            process.stdout.write(event.data.text);
            break;
          case "tool_call":
            console.log(
              `\n  \x1b[33m⚡ ${event.data.name}\x1b[0m`
            );
            break;
          case "tool_result":
            break;
          case "error":
            console.log(`\n  \x1b[31mError: ${event.data.error}\x1b[0m`);
            break;
          case "done":
            console.log(
              `\n\x1b[90m  Cost: $${event.data.routing?.estimatedCost?.toFixed(6) || "0"}\x1b[0m\n`
            );
            break;
        }
      }
    } catch (error) {
      console.error(
        `\n  \x1b[31mError: ${error instanceof Error ? error.message : String(error)}\x1b[0m`
      );
    }

    prompt();
  });
}

prompt();
