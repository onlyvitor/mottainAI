#!/usr/bin/env bun
import React, { useCallback, useState } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import type { CommandModule } from "yargs";
import { Agent, type AgentEvent } from "@mottainai/core";
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

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  cost?: number;
}

interface EventLog {
  type: string;
  data: any;
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
  const agent = new Agent(registry, router, config);

  return { agent, config };
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [eventLog, setEventLog] = useState<EventLog[]>([]);
  const [currentText, setCurrentText] = useState("");
  const { exit } = useApp();

  const { agent } = getRuntime();

  const handleSubmit = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || isProcessing) return;

      setMessages((prev) => [...prev, { role: "user", content: prompt }]);
      setInput("");
      setEventLog([]);
      setIsProcessing(true);
      setCurrentText("");

      try {
        for await (const event of agent.run(prompt)) {
          setEventLog((prev) => [...prev, event]);

          switch (event.type) {
            case "routing":
              break;
            case "text":
              setCurrentText((prev) => prev + event.data.text);
              break;
            case "tool_call":
              break;
            case "tool_result":
              break;
            case "error":
              setMessages((prev) => [
                ...prev,
                {
                  role: "system",
                  content: `Error: ${event.data.error}`,
                },
              ]);
              break;
            case "done":
              if (currentText) {
                setMessages((prev) => [
                  ...prev.slice(0, -1),
                  {
                    role: "assistant",
                    content: currentText,
                    model: event.data.routing?.model?.id,
                  },
                ]);
              }
              break;
          }
        }
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ]);
      } finally {
        setIsProcessing(false);
        setCurrentText("");
      }
    },
    [agent, isProcessing, currentText],
  );

  useInput((char, key) => {
    if (key.ctrl && char === "c") {
      exit();
      return;
    }

    if (key.return) {
      if (input.trim() && !isProcessing) {
        setInput("");
        handleSubmit(input);
      }
      return;
    }

    if (key.backspace) {
      setInput(input.slice(0, -1));
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
        {messages.map((msg, i) => (
          <Box key={i} marginBottom={1}>
            <Text
              bold
              color={
                msg.role === "user"
                  ? "green"
                  : msg.role === "assistant"
                    ? "blue"
                    : "red"
              }
            >
              {msg.role === "user"
                ? "You: "
                : msg.role === "assistant"
                  ? "AI: "
                  : "Err: "}
            </Text>
            <Text wrap="wrap">{msg.content}</Text>
          </Box>
        ))}

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
          "disable mini session history replay on resume and after resize",
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

    if (args.yolo || args.auto) {
      console.log("Auto-approve permissions are not supported in this build");
      process.exitCode = 1;
      return;
    }

    render(React.createElement(App));
  },
};
