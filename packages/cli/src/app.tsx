#!/usr/bin/env bun
import React, { useCallback, useEffect, useState } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import type { CommandModule } from "yargs";
import { Agent } from "@mottainai/core";
import { LLMRouter } from "@mottainai/router";
import { createRegistry } from "@mottainai/providers";
import { loadConfig } from "@mottainai/core";

export interface RunCommandArgs {
  prompt?: string;
  model?: string;
  agent?: string;
  continue?: boolean;
  session?: string;
  fork?: boolean;
  mini?: boolean;
  yolo?: boolean;
  auto?: boolean;
  replay?: boolean;
  replayLimit?: number;
  demo?: boolean;
  "no-replay"?: boolean;
  "replay-limit"?: number;
  attach?: string;
  port?: number;
  hostname?: string;
  mdns?: boolean;
  "no-mdns"?: boolean;
  "mdns-domain"?: string;
  cors?: boolean;
  help?: boolean;
  version?: boolean;
}

type TranscriptItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; model?: string; cost?: number }
  | { kind: "error"; text: string }
  | { kind: "activity"; text: string };

interface PermissionRequestState {
  toolName: string;
  input: unknown;
  resolve: (allowed: boolean) => void;
}

let permissionBridge: ((req: PermissionRequestState) => void) | null = null;
const cliFlags = { auto: false };

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

let runtime: ReturnType<typeof createRuntime> | null = null;

function getRuntime() {
  if (!runtime) {
    runtime = createRuntime();
  }
  return runtime;
}

function createRuntime() {
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
  const agent = new Agent(registry, router, {
    ...config,
    dailyBudgetUsd: config.defaults.budget.dailyUsd,
    requestPermission: cliFlags.auto
      ? async () => true
      : (toolName, input) =>
          new Promise<boolean>((resolve) => {
            if (permissionBridge) {
              permissionBridge({ toolName, input, resolve });
            } else {
              resolve(false);
            }
          }),
  });

  return { agent, config };
}

function App() {
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentText, setCurrentText] = useState("");
  const [permissionRequest, setPermissionRequest] =
    useState<PermissionRequestState | null>(null);
  const { exit } = useApp();

  const { agent } = getRuntime();

  useEffect(() => {
    permissionBridge = (req) => setPermissionRequest(req);
    return () => {
      permissionBridge = null;
    };
  }, []);

  const handleSubmit = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || isProcessing) return;

      setItems((prev) => [...prev, { kind: "user", text: prompt }]);
      setInput("");
      setIsProcessing(true);
      setCurrentText("");

      let accumulated = "";

      try {
        for await (const event of agent.run(prompt)) {
          switch (event.type) {
            case "routing": {
              const d = event.data;
              if (accumulated) {
                accumulated = "";
                setCurrentText("");
              }
              if (d?.model) {
                setItems((prev) => [
                  ...prev,
                  {
                    kind: "activity",
                    text: `→ ${d.model.displayName ?? d.model.id} · ${d.tier} · ~$${Number(d.estimatedCost ?? 0).toFixed(4)}`,
                  },
                ]);
              }
              break;
            }
            case "text":
              accumulated += event.data.text;
              setCurrentText(accumulated);
              break;
            case "tool_call":
              setItems((prev) => [
                ...prev,
                {
                  kind: "activity",
                  text: `⚙ ${event.data.name} ${truncate(JSON.stringify(event.data.args ?? {}), 60)}`,
                },
              ]);
              break;
            case "tool_result": {
              const r = event.data.result;
              const ok = r?.success !== false;
              const detail = ok
                ? truncate(String(r?.output ?? ""), 60)
                : truncate(String(r?.error ?? ""), 60);
              setItems((prev) => [
                ...prev,
                {
                  kind: "activity",
                  text: `${ok ? "✓" : "✗"} ${event.data.name} ${detail}`,
                },
              ]);
              break;
            }
            case "error":
              setItems((prev) => [
                ...prev,
                { kind: "error", text: String(event.data.error) },
              ]);
              break;
            case "done": {
              const d = event.data;
              if (accumulated.trim()) {
                setItems((prev) => [
                  ...prev,
                  {
                    kind: "assistant",
                    text: accumulated,
                    model: d?.routing?.model?.id,
                    cost: d?.usage?.costUsd,
                  },
                ]);
              }
              break;
            }
          }
        }
      } catch (error) {
        setItems((prev) => [
          ...prev,
          {
            kind: "error",
            text: error instanceof Error ? error.message : String(error),
          },
        ]);
      } finally {
        setIsProcessing(false);
        setCurrentText("");
      }
    },
    [agent, isProcessing],
  );

  useInput((char, key) => {
    if (key.ctrl && char === "c") {
      exit();
      return;
    }

    if (permissionRequest) {
      if (char === "y" || char === "Y") {
        permissionRequest.resolve(true);
        setPermissionRequest(null);
      } else if (char === "n" || char === "N" || key.escape) {
        permissionRequest.resolve(false);
        setPermissionRequest(null);
      }
      return;
    }

    if (key.return) {
      if (input.trim() && !isProcessing) {
        setInput("");
        handleSubmit(input);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput((current) => current.slice(0, -1));
      return;
    }

    if (!isProcessing && char) {
      setInput(input + char);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box
        borderStyle="round"
        borderColor="orange"
        marginBottom={1}
        paddingX={1}
        flexDirection="column"
      >
        <Text bold color="orange" wrap="truncate-end">
          ▄▄▄      ▄▄▄                                    ▄▄▄▄   ▄▄▄▄▄
        </Text>
        <Text bold color="orange" wrap="truncate-end">
          ████▄  ▄████        ██    ██        ▀▀        ▄██▀▀██▄  ███
        </Text>
        <Text bold color="orange" wrap="truncate-end">
          ███▀████▀███ ▄███▄ ▀██▀▀ ▀██▀▀ ▀▀█▄ ██  ████▄ ███  ███  ███
        </Text>
        <Text bold color="orange" wrap="truncate-end">
          ███  ▀▀  ███ ██ ██  ██    ██  ▄█▀██ ██  ██ ██ ███▀▀███  ███
        </Text>
        <Text bold color="orange" wrap="truncate-end">
          ███      ███ ▀███▀  ██    ██  ▀█▄██ ██▄ ██ ██ ███  ███ ▄███▄
        </Text>
        <Box marginTop={1}>
          <Text color="gray"> — AI coding assistant with cost routing</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {items.map((item, i) => {
          switch (item.kind) {
            case "user":
              return (
                <Box key={i} marginBottom={1}>
                  <Text bold color="green">
                    You:{" "}
                  </Text>
                  <Text wrap="wrap">{item.text}</Text>
                </Box>
              );
            case "assistant":
              return (
                <Box key={i} marginBottom={1} flexDirection="column">
                  <Box>
                    <Text bold color="blue">
                      AI:{" "}
                    </Text>
                    <Text wrap="wrap">{item.text}</Text>
                  </Box>
                  {(item.model || item.cost != null) && (
                    <Text dimColor color="gray">
                      {"    "}
                      {item.model ?? ""}
                      {item.cost != null ? ` · $${item.cost.toFixed(4)}` : ""}
                    </Text>
                  )}
                </Box>
              );
            case "error":
              return (
                <Box key={i} marginBottom={1}>
                  <Text bold color="red">
                    Err:{" "}
                  </Text>
                  <Text color="red" wrap="wrap">
                    {item.text}
                  </Text>
                </Box>
              );
            case "activity":
              return (
                <Box key={i}>
                  <Text dimColor color="gray" wrap="truncate-end">
                    {"  "}
                    {item.text}
                  </Text>
                </Box>
              );
          }
        })}

        {isProcessing && currentText && (
          <Box marginBottom={1}>
            <Text bold color="blue">
              AI:{" "}
            </Text>
            <Text wrap="wrap">{currentText}</Text>
          </Box>
        )}

        {isProcessing && !currentText && (
          <Box>
            <Text color="yellow">Thinking...</Text>
          </Box>
        )}
      </Box>

      {permissionRequest && (
        <Box
          borderStyle="round"
          borderColor="yellow"
          paddingX={1}
          flexDirection="column"
          marginBottom={1}
        >
          <Text bold color="yellow">
            Allow {permissionRequest.toolName}?
          </Text>
          <Text color="gray" wrap="truncate-end">
            {truncate(JSON.stringify(permissionRequest.input), 200)}
          </Text>
          <Text color="white">[y] allow / [n] deny</Text>
        </Box>
      )}

      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="green">{"> "}</Text>
        <Text color="white" wrap="truncate-end">
          {input}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">
          Type your message and press Enter. Ctrl+C to exit.
        </Text>
      </Box>
    </Box>
  );
}

export const RunCommand: CommandModule<{}, RunCommandArgs> = {
  command: "$0",
  describe: "start mottainai tui",
  builder: (yargs) =>
    yargs
      .positional("prompt", {
        type: "string",
        describe: "prompt to use",
      })
      .option("model", {
        type: "string",
        alias: ["m"],
        describe: "model to use in the format of provider/model",
      })
      .option("agent", {
        type: "string",
        describe: "agent to use",
      })
      .option("continue", {
        alias: ["c"],
        describe: "continue the last session",
        type: "boolean",
      })
      .option("session", {
        alias: ["s"],
        type: "string",
        describe: "session id to continue",
      })
      .option("fork", {
        type: "boolean",
        describe:
          "fork the session when continuing (use with --continue or --session)",
      })
      .option("auto", {
        type: "boolean",
        describe:
          "auto-approve permissions that are not explicitly denied (dangerous!)",
        default: false,
      })
      .option("yolo", {
        type: "boolean",
        hidden: true,
        default: false,
      })
      .option("mini", {
        type: "boolean",
        describe: "start the minimal interactive interface",
        default: false,
      })
      .option("replay", {
        type: "boolean",
        hidden: true,
      })
      .option("no-replay", {
        type: "boolean",
        describe:
          "disable mini session history replay on resize",
      })
      .option("replay-limit", {
        type: "number",
        describe: "cap visible mini replay to the newest N messages",
      })
      .option("demo", {
        type: "boolean",
        hidden: true,
      }),
  async handler(args) {
    if (args.mini) {
      console.log("Mini mode is not supported in this build");
      process.exitCode = 1;
      return;
    }

    cliFlags.auto = Boolean(args.auto || args.yolo);

    render(React.createElement(App));
  },
};
