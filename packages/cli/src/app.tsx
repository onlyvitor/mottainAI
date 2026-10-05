#!/usr/bin/env bun
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { render, Box, Text, Static, useInput, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
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
  | { kind: "banner" }
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; model?: string; cost?: number }
  | { kind: "error"; text: string }
  | { kind: "activity"; text: string };

interface PermissionRequestState {
  toolName: string;
  input: unknown;
  resolve: (allowed: boolean) => void;
}

interface SessionStats {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  dailySpentUsd: number;
  dailyBudgetUsd: number;
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

function Banner() {
  return (
    <Box
      borderStyle="round"
      borderColor="orange"
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
  );
}

function TranscriptEntry({ item }: { item: TranscriptItem }) {
  switch (item.kind) {
    case "banner":
      return <Banner />;
    case "user":
      return (
        <Box>
          <Text bold color="green">
            You:{" "}
          </Text>
          <Text wrap="wrap">{item.text}</Text>
        </Box>
      );
    case "assistant":
      return (
        <Box flexDirection="column">
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
        <Box>
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
        <Text dimColor color="gray" wrap="truncate-end">
          {"  "}
          {item.text}
        </Text>
      );
  }
}

function App() {
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentText, setCurrentText] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [stats, setStats] = useState<SessionStats>({
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    dailySpentUsd: 0,
    dailyBudgetUsd: 0,
  });
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [permissionRequest, setPermissionRequest] =
    useState<PermissionRequestState | null>(null);
  const { exit } = useApp();
  const stdout = useStdout();

  const { agent } = getRuntime();

  const staticItems = useMemo<TranscriptItem[]>(
    () => [{ kind: "banner" }, ...items],
    [items],
  );

  useEffect(() => {
    permissionBridge = (req) => setPermissionRequest(req);
    return () => {
      permissionBridge = null;
    };
  }, []);

  const handleSubmit = useCallback(
    async (raw: string) => {
      const prompt = raw.trim();
      if (!prompt || isProcessing) return;

      if (prompt.startsWith("/")) {
        const [cmd] = prompt.slice(1).split(" ");
        switch (cmd) {
          case "exit":
            exit();
            return;
          case "clear":
            stdout.write("\x1b[2J\x1b[1;1H");
            setItems([]);
            setHistory([]);
            setHistoryIndex(-1);
            setLastModel(null);
            setStats({
              costUsd: 0,
              inputTokens: 0,
              outputTokens: 0,
              dailySpentUsd: 0,
              dailyBudgetUsd: 0,
            });
            return;
          case "help":
            setItems((prev) => [
              ...prev,
              {
                kind: "assistant",
                text: [
                  "/help - show this help",
                  "/clear - clear the conversation and stats",
                  "/exit - quit mottainai",
                  "Ctrl+C - cancel the current run, or quit when idle",
                ].join("\n"),
              },
            ]);
            return;
          default:
            setItems((prev) => [
              ...prev,
              {
                kind: "error",
                text: `Unknown command: /${cmd}. Try /help`,
              },
            ]);
            return;
        }
      }

      setItems((prev) => [...prev, { kind: "user", text: prompt }]);
      setHistory((prev) => [...prev, prompt]);
      setHistoryIndex(-1);
      setInput("");
      setIsProcessing(true);
      setCurrentText("");
      setCurrentStep(0);

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
                setLastModel(d.model.displayName ?? d.model.id);
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
            case "thinking":
              setCurrentStep(event.data.step ?? 0);
              break;
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
                String(event.data.error) === "Cancelled by user"
                  ? {
                      kind: "activity",
                      text: "· run cancelled by user",
                    }
                  : { kind: "error", text: String(event.data.error) },
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
              if (d?.usage) {
                setStats((prev) => ({
                  costUsd: prev.costUsd + Number(d.usage.costUsd ?? 0),
                  inputTokens:
                    prev.inputTokens + Number(d.usage.inputTokens ?? 0),
                  outputTokens:
                    prev.outputTokens + Number(d.usage.outputTokens ?? 0),
                  dailySpentUsd: Number(d.budget?.dailySpentUsd ?? 0),
                  dailyBudgetUsd: Number(d.budget?.dailyBudgetUsd ?? 0),
                }));
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
        setCurrentStep(0);
      }
    },
    [agent, isProcessing, exit],
  );

  useInput((char, key) => {
    if (key.ctrl && char === "c") {
      if (isProcessing) {
        agent.abort();
      } else {
        exit();
      }
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

    if (isProcessing) return;

    if (key.upArrow) {
      if (history.length === 0) return;
      const next =
        historyIndex === -1
          ? history.length - 1
          : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setInput(history[next] ?? "");
      return;
    }

    if (key.downArrow) {
      if (historyIndex === -1) return;
      const next = historyIndex + 1;
      if (next >= history.length) {
        setHistoryIndex(-1);
        setInput("");
      } else {
        setHistoryIndex(next);
        setInput(history[next] ?? "");
      }
      return;
    }
  });

  const totalTokens = stats.inputTokens + stats.outputTokens;

  return (
    <Box flexDirection="column">
      <Static items={staticItems}>
        {(item, index) => (
          <Box key={index} marginBottom={item.kind === "activity" ? 0 : 1} paddingLeft={1} paddingRight={1}>
            <TranscriptEntry item={item} />
          </Box>
        )}
      </Static>

      <Box flexDirection="column" paddingX={1}>
        {isProcessing && currentText && (
          <Box marginBottom={1}>
            <Text bold color="blue">
              AI:{" "}
            </Text>
            <Text wrap="wrap">{currentText}</Text>
          </Box>
        )}

        {isProcessing && !currentText && !permissionRequest && (
          <Box marginBottom={1}>
            <Text color="yellow">
              <Spinner type="dots" /> Thinking...
              {currentStep > 1 ? ` (step ${currentStep})` : ""}
            </Text>
          </Box>
        )}

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

        <Box borderStyle="round" borderColor={isProcessing ? "gray" : "orange"} paddingX={1}>
          <Text color="green">{"> "}</Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            focus={!isProcessing && !permissionRequest}
            showCursor
            placeholder="Ask anything about your code..."
          />
        </Box>

        <Box marginTop={1} justifyContent="space-between">
          <Text dimColor color="gray" wrap="truncate-end">
            {isProcessing
              ? `${lastModel ?? "routing"}… · step ${Math.max(currentStep, 1)} · Ctrl+C to cancel`
              : "Enter to send · ↑/↓ history · /help for commands · Ctrl+C to exit"}
          </Text>
          <Text dimColor color="gray" wrap="truncate-end">
            {lastModel ? `${lastModel} · ` : ""}session $
            {stats.costUsd.toFixed(4)} · {totalTokens} tok
            {stats.dailyBudgetUsd > 0
              ? ` · today $${stats.dailySpentUsd.toFixed(2)}/$${stats.dailyBudgetUsd.toFixed(0)}`
              : ""}
          </Text>
        </Box>
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
        describe: "disable mini session history replay on resize",
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
