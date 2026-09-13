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

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  bgCyan: "\x1b[46m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgRed: "\x1b[41m",
  bgMagenta: "\x1b[45m",
};

const c = COLORS;

const LOGO = `
${c.cyan}${c.bold}▄▄   ▄▄  ▄▄▄ ▄▄▄▄▄▄ ▄▄▄▄▄▄ ▄▄▄  ▄▄ ▄▄  ▄▄  ▄▄▄  ▄▄${c.reset}
${c.cyan}${c.bold}██▀▄▀██ ██▀██  ██     ██  ██▀██ ██ ███▄██ ██▀██ ██${c.reset}
${c.cyan}${c.bold}██   ██ ▀███▀  ██     ██  ██▀██ ██ ██ ▀██ ██▀██ ██${c.reset}
${c.dim}                         AI coding assistant with cost routing${c.reset}
`;

const DIVIDER = `${c.gray}${"─".repeat(60)}${c.reset}`;

function clear() {
  process.stdout.write("\x1b[2J\x1b[H");
}

function printLogo() {
  console.log(LOGO);
}

function printDivider() {
  console.log(DIVIDER);
}

function printRouting(model: string, tier: string, score: number) {
  const tierColor =
    tier === "SIMPLE"
      ? c.green
      : tier === "MEDIUM"
        ? c.yellow
        : tier === "COMPLEX"
          ? c.magenta
          : c.red;
  console.log(
    `\n  ${c.gray}╭─ ${c.bold}routing${c.reset}${c.gray} ─────────────────────────────────────╮${c.reset}`
  );
  console.log(
    `  ${c.gray}│${c.reset}  ${c.gray}model:${c.reset}  ${c.bold}${model}${c.reset}`
  );
  console.log(
    `  ${c.gray}│${c.reset}  ${c.gray}tier:${c.reset}   ${tierColor}${c.bold}${tier}${c.reset}  ${c.gray}(score: ${score.toFixed(3)})${c.reset}`
  );
  console.log(
    `  ${c.gray}╰──────────────────────────────────────────────────╯${c.reset}`
  );
}

function printToolCall(name: string, args: any) {
  const argsStr = JSON.stringify(args).slice(0, 50);
  console.log(
    `  ${c.yellow}⚡ ${c.bold}${name}${c.reset}${c.gray} ${argsStr}${argsStr.length >= 50 ? "..." : ""}${c.reset}`
  );
}

function printToolResult(name: string, success: boolean) {
  const icon = success ? `${c.green}✓` : `${c.red}✗`;
  console.log(
    `  ${icon}${c.reset} ${c.gray}${name}${c.reset}`
  );
}

function printCost(cost: number) {
  console.log(
    `\n  ${c.gray}cost:${c.reset} ${c.bold}$${cost.toFixed(6)}${c.reset}`
  );
}

function printError(error: string) {
  console.log(
    `\n  ${c.red}${c.bold}error:${c.reset} ${c.red}${error}${c.reset}`
  );
}

function printDone(model: string, cost: number) {
  const costStr = `$${cost.toFixed(6)}`;
  console.log(
    `\n  ${c.green}${c.bold}✓${c.reset} ${c.gray}done${c.reset}  ${c.gray}model:${c.reset} ${model}  ${c.gray}cost:${c.reset} ${costStr}`
  );
}

function printWelcome() {
  console.log(LOGO);
  console.log(
    `  ${c.gray}commands:${c.reset}`
  );
  console.log(
    `    ${c.green}${c.bold}/exit${c.reset}    ${c.gray}exit the application${c.reset}`
  );
  console.log(
    `    ${c.green}${c.bold}/clear${c.reset}   ${c.gray}clear the screen${c.reset}`
  );
  console.log(
    `    ${c.green}${c.bold}/cost${c.reset}    ${c.gray}show session cost${c.reset}`
  );
  console.log(DIVIDER);
  console.log(
    `  ${c.gray}session:${c.reset} ${c.dim}${new Date().toISOString().slice(0, 19)}${c.reset}`
  );
  console.log(DIVIDER);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const agent = new Agent(registry, router, config);

let totalCost = 0;
let currentModel = "";
let currentTier = "";
let currentScore = 0;

function prompt() {
  rl.question(`${c.green}${c.bold}>${c.reset} `, async (input) => {
    const cmd = input.trim().toLowerCase();

    if (cmd === "/exit" || cmd === "/quit" || cmd === "/q") {
      console.log(
        `\n  ${c.gray}bye! total cost: $${totalCost.toFixed(6)}${c.reset}\n`
      );
      process.exit(0);
    }

    if (cmd === "/clear") {
      clear();
      printWelcome();
      prompt();
      return;
    }

    if (cmd === "/cost") {
      console.log(
        `\n  ${c.gray}session cost:${c.reset} ${c.bold}$${totalCost.toFixed(6)}${c.reset}\n`
      );
      prompt();
      return;
    }

    if (!input.trim()) {
      prompt();
      return;
    }

    try {
      for await (const event of agent.run(input)) {
        switch (event.type) {
          case "routing":
            currentModel = event.data.model.displayName;
            currentTier = event.data.tier;
            currentScore = event.data.rawScore;
            printRouting(currentModel, currentTier, currentScore);
            break;
          case "text":
            process.stdout.write(event.data.text);
            break;
          case "tool_call":
            printToolCall(event.data.name, event.data.args);
            break;
          case "tool_result":
            printToolResult(
              event.data.name,
              event.data.result?.success ?? false
            );
            break;
          case "error":
            printError(event.data.error);
            break;
          case "done":
            const cost = event.data.routing?.estimatedCost || 0;
            totalCost += cost;
            printDone(currentModel, cost);
            console.log();
            break;
        }
      }
    } catch (error) {
      printError(error instanceof Error ? error.message : String(error));
    }

    prompt();
  });
}

clear();
printWelcome();
prompt();
