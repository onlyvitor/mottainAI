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

const W = process.stdout.columns || 80;

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

const LOGO = `▄▄   ▄▄  ▄▄▄ ▄▄▄▄▄▄ ▄▄▄▄▄▄ ▄▄▄  ▄▄ ▄▄  ▄▄  ▄▄▄  ▄▄
██▀▄▀██ ██▀██  ██     ██  ██▀██ ██ ███▄██ ██▀██ ██
██   ██ ▀███▀  ██     ██  ██▀██ ██ ██ ▀██ ██▀██ ██`;

function center(text: string): string {
  const lines = text.split("\n");
  return lines
    .map((line) => {
      const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
      const pad = Math.max(0, Math.floor((W - stripped.length) / 2));
      return " ".repeat(pad) + line;
    })
    .join("\n");
}

function line(char = "─"): string {
  return char.repeat(W - 2);
}

function box(lines: string[], color = c.gray): string {
  const result: string[] = [];
  result.push(`${color}╭${line()}╮${c.reset}`);
  for (const l of lines) {
    const stripped = l.replace(/\x1b\[[0-9;]*m/g, "");
    const pad = Math.max(0, W - 4 - stripped.length);
    result.push(`${color}│${c.reset}  ${l}${" ".repeat(pad)}  ${color}│${c.reset}`);
  }
  result.push(`${color}╰${line()}╯${c.reset}`);
  return result.join("\n");
}

function clear() {
  process.stdout.write("\x1b[2J\x1b[H");
}

function printHeader() {
  console.log();
  console.log(center(`${c.cyan}${c.bold}${LOGO}${c.reset}`));
  console.log(center(`${c.dim}AI coding assistant with cost routing${c.reset}`));
  console.log();
}

function printHelp() {
  console.log(box([
    `${c.bold}commands:${c.reset}`,
    `  ${c.green}/exit${c.reset}   ${c.gray}exit the application${c.reset}`,
    `  ${c.green}/clear${c.reset}  ${c.gray}clear the screen${c.reset}`,
    `  ${c.green}/cost${c.reset}   ${c.gray}show session cost${c.reset}`,
    `  ${c.green}/help${c.reset}   ${c.gray}show this help${c.reset}`,
  ]));
  console.log();
}

function printRouting(model: string, tier: string, score: number) {
  const tierColor =
    tier === "SIMPLE" ? c.green :
    tier === "MEDIUM" ? c.yellow :
    tier === "COMPLEX" ? c.magenta : c.red;

  console.log(box([
    `${c.bold}routing${c.reset}`,
    ``,
    `  ${c.gray}model:${c.reset}  ${c.bold}${model}${c.reset}`,
    `  ${c.gray}tier:${c.reset}   ${tierColor}${c.bold}${tier}${c.reset}  ${c.gray}(score: ${score.toFixed(3)})${c.reset}`,
  ]));
  console.log();
}

function printTool(name: string, status: "run" | "ok" | "fail", args?: any) {
  if (status === "run") {
    const argsStr = args ? JSON.stringify(args).slice(0, 40) : "";
    const suffix = argsStr.length >= 40 ? "..." : "";
    console.log(`  ${c.yellow}󱐧${c.reset} ${c.bold}${name}${c.reset} ${c.gray}${argsStr}${suffix}${c.reset}`);
  } else if (status === "ok") {
    console.log(`  ${c.green}✔${c.reset} ${c.gray}${name}${c.reset}`);
  } else {
    console.log(`  ${c.red}✘${c.reset} ${c.gray}${name}${c.reset}`);
  }
}

function printError(error: string) {
  console.log(box([`${c.red}${c.bold}error:${c.reset} ${c.red}${error}${c.reset}`], c.red));
  console.log();
}

function printDone(model: string, cost: number) {
  console.log(box([
    `${c.green}${c.bold}✔ done${c.reset}`,
    ``,
    `  ${c.gray}model:${c.reset}  ${model}`,
    `  ${c.gray}cost:${c.reset}   ${c.bold}$${cost.toFixed(6)}${c.reset}`,
  ]));
  console.log();
}

function printInputBox() {
  console.log(box([`${c.bold}input:${c.reset} ${c.dim}type your message...${c.reset}`], c.cyan));
  process.stdout.write("\x1b[A");
}

function showPrompt() {
  process.stdout.write(`${c.cyan}${c.bold} ▸${c.reset} `);
}

function updateInputBox(input: string) {
  const display = input || `${c.dim}type your message...${c.reset}`;
  const stripped = display.replace(/\x1b\[[0-9;]*m/g, "");
  const pad = Math.max(0, W - 14 - stripped.length);
  process.stdout.write(`\r${c.cyan}│${c.reset}  ${c.bold}input:${c.reset}  ${display}${" ".repeat(pad)}  ${c.cyan}│${c.reset}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

const agent = new Agent(registry, router, config);

let totalCost = 0;

function prompt() {
  // Print fresh input box
  console.log(box([`${c.bold}input:${c.reset} ${c.dim}type your message...${c.reset}`], c.cyan));
  process.stdout.write(`\x1b[1A`);
  process.stdout.write(`\r${c.cyan}│${c.reset}  ${c.bold}input:${c.reset}  `);

  rl.question("", async (input) => {
    // Move down past the box
    process.stdout.write("\n");

    const cmd = input.trim().toLowerCase();

    if (cmd === "/exit" || cmd === "/quit" || cmd === "/q") {
      console.log(center(`${c.gray}bye! total cost: $${totalCost.toFixed(6)}${c.reset}`));
      console.log();
      process.exit(0);
    }

    if (cmd === "/clear") {
      clear();
      printHeader();
      prompt();
      return;
    }

    if (cmd === "/cost") {
      console.log(box([`${c.gray}session cost:${c.reset} ${c.bold}$${totalCost.toFixed(6)}${c.reset}`]));
      console.log();
      prompt();
      return;
    }

    if (cmd === "/help") {
      printHelp();
      prompt();
      return;
    }

    if (!input.trim()) {
      prompt();
      return;
    }

    let currentModel = "";
    let currentTier = "";
    let currentScore = 0;

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
            printTool(event.data.name, "run", event.data.args);
            break;
          case "tool_result":
            printTool(event.data.name, event.data.result?.success ? "ok" : "fail");
            break;
          case "error":
            printError(event.data.error);
            break;
          case "done":
            const cost = event.data.routing?.estimatedCost || 0;
            totalCost += cost;
            printDone(currentModel, cost);
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
printHeader();
printHelp();
prompt();
