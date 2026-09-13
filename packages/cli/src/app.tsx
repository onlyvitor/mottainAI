#!/usr/bin/env bun
import React, { useState, useEffect, useCallback } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { Agent, type AgentEvent } from "@yorucode/core";
import { LLMRouter } from "@yorucode/router";
import { createRegistry } from "@yorucode/providers";
import { loadConfig } from "@yorucode/core";

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

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [eventLog, setEventLog] = useState<EventLog[]>([]);
  const [currentText, setCurrentText] = useState("");
  const { exit } = useApp();

  const agent = React.useMemo(
    () => new Agent(registry, router, config),
    []
  );

  const handleSubmit = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || isProcessing) return;

      setMessages((prev) => [...prev, { role: "user", content: prompt }]);
      setInput("");
      setIsProcessing(true);
      setCurrentText("");
      setEventLog([]);

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
    [agent, isProcessing, currentText]
  );

  useInput((char, key) => {
    if (key.ctrl && char === "c") {
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" marginBottom={1} paddingX={1}>
        <Text bold color="cyan">
          YoruCode
        </Text>
        <Text color="gray">
          {" "}
          — AI coding assistant with cost routing
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, i) => (
          <Box key={i} marginBottom={1}>
            <Text bold color={msg.role === "user" ? "green" : msg.role === "assistant" ? "blue" : "red"}>
              {msg.role === "user" ? "You: " : msg.role === "assistant" ? "AI: " : "Err: "}
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
        <Text
          color="white"
          inverse
          wrap="truncate-end"
        >
          {input}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">
          Type your message. Ctrl+C to exit.
        </Text>
      </Box>
    </Box>
  );
}

render(React.createElement(App));
