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
const H = process.stdout.rows || 24;

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
  white: "\x1b[97m",
  brightCyan: "\x1b[96m",
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

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  cost?: number;
  tokens?: number;
}

let scrollback: Message[] = [];
let totalCost = 0;
let isRunning = false;
let showLogo = true;
let shownCommands = false;

function renderAll() {
  const parts: string[] = [];

  if (showLogo) {
    parts.push(center(`${c.cyan}${c.bold}${LOGO}${c.reset}`));
    parts.push(center(`${c.dim}AI coding assistant with cost routing${c.reset}`));
    parts.push("");
    parts.push(box([
      `${c.bold}commands:${c.reset}`,
      `  ${c.green}/exit${c.reset}   ${c.gray}exit the application${c.reset}`,
      `  ${c.green}/clear${c.reset}  ${c.gray}clear the screen${c.reset}`,
      `  ${c.green}/cost${c.reset}   ${c.gray}show session cost${c.reset}`,
    ]));
    parts.push("");
    showLogo = false;
    shownCommands = true;
  }

  for (const msg of scrollback) {
    if (msg.role === "user") {
      parts.push(`  ${c.bold}›${c.reset} ${msg.content}`);
    } else if (msg.role === "assistant") {
      parts.push(`  ${c.dim}[${msg.model}]${c.reset}`);
      parts.push(`  ${msg.content}`);
      if (msg.cost) {
        parts.push(`  ${c.gray}cost: $${msg.cost.toFixed(6)}${c.reset}`);
      }
    } else if (msg.role === "system") {
      parts.push(`  ${c.red}${msg.content}${c.reset}`);
    }
    parts.push("");
  }

  // Footer - always visible at bottom
  const footerLines: string[] = [];
  footerLines.push(`${c.cyan}╭${line()}╮${c.reset}`);
  footerLines.push(`${c.cyan}│${c.reset}  ${c.bold}›${c.reset} ${c.brightCyan}type your message...${c.reset}`);
  footerLines.push(`${c.cyan}╰${line()}╯${c.reset}`);
  parts.push(footerLines.join("\n"));

  const output = parts.join("\n");
  process.stdout.write("\x1b[2J\x1b[H");
  process.stdout.write(output + "\n");
}

function renderIncremental(newMessages: Message[], streamingText?: string) {
  for (const msg of newMessages) {
    scrollback.push(msg);
  }
  renderAll();
  if (streamingText) {
    process.stdout.write(streamingText);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

const agent = new Agent(registry, router, config);

function promptUser() {
  if (isRunning) return;
  renderAll();
  // Position cursor in the footer input area
  process.stdout.write("\x1b[5A");
  process.stdout.write(`\r${c.cyan}│${c.reset}  ${c.bold}›${c.reset}  `);

  rl.question("", async (input) => {
    const cmd = input.trim().toLowerCase();

    if (cmd === "/exit" || cmd === "/quit" || cmd === "/q") {
      console.log(center(`${c.gray}bye! total cost: $${totalCost.toFixed(6)}${c.reset}`));
      process.exit(0);
    }

    if (cmd === "/clear") {
      scrollback = [];
      totalCost = 0;
      showLogo = true; // Reset logo flag
      renderAll();
      promptUser();
      return;
    }

    if (cmd === "/cost") {
      console.log(box([`${c.gray}session cost:${c.reset} ${c.bold}$${totalCost.toFixed(6)}${c.reset}`]));
      promptUser();
      return;
    }

    if (!input.trim()) {
      promptUser();
      return;
    }

    const userMsg: Message = { role: "user", content: input.trim() };
    scrollback.push(userMsg);

    isRunning = true;

    let currentModel = "";
    let currentCost = 0;
    let streamingContent = "";

    try {
      for await (const event of agent.run(input)) {
        switch (event.type) {
          case "routing":
            currentModel = event.data.model.displayName;
            currentCost = event.data.estimatedCost || 0;
            break;
          case "text":
            streamingContent += event.data.text;
            // Update inline - overwrite the input line
            process.stdout.write(`\r${c.cyan}│${c.reset}  ${c.bold}›${c.reset}  ${streamingContent}`);
            break;
          case "tool_call":
            console.log(`\n  ${c.yellow}󱐧 ${event.data.name}${c.reset}`);
            break;
          case "tool_result":
            break;
          case "error":
            console.log(`\n  ${c.red}Error: ${event.data.error}${c.reset}`);
            break;
          case "done":
            totalCost += currentCost;
            break;
        }
      }
    } catch (error) {
      const errMsg: Message = {
        role: "system",
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
      scrollback.push(errMsg);
    }

    if (streamingContent) {
      const assistantMsg: Message = {
        role: "assistant",
        content: streamingContent,
        model: currentModel,
        cost: currentCost,
      };
      scrollback.push(assistantMsg);
    }

    isRunning = false;
    promptUser();
  });
}

clear();
promptUser();