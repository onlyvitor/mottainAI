import { streamText, stepCountIs, tool, type ModelMessage } from "ai";
import { LLMRouter, calculateCost, estimateChatTokens } from "@mottainai/router";
import { builtInTools, type ToolContext } from "@mottainai/tools";
import { loadDailySpend, recordSpend } from "./budget";
import {
  createSession,
  addMessage,
  compactSession,
  type Session,
} from "./session";

export interface AgentConfig {
  maxSteps?: number;
  workingDirectory?: string;
  systemPrompt?: string;
  dailyBudgetUsd?: number;
}

export interface AgentEvent {
  type:
    | "thinking"
    | "text"
    | "tool_call"
    | "tool_result"
    | "routing"
    | "error"
    | "done";
  data: any;
}

function contentToText(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content;
  let text = "";
  for (const part of content as Array<{ type: string; text?: string }>) {
    if (part.type === "text" && part.text) text += part.text;
  }
  return text;
}

function historyAsText(
  messages: ModelMessage[]
): Array<{ role: string; content: string }> {
  return messages.map((m) => ({ role: m.role, content: contentToText(m.content) }));
}

export class Agent {
  private router: LLMRouter;
  private config: AgentConfig;
  private session: Session;
  private providers: any;
  private history: ModelMessage[] = [];
  private abortController: AbortController | null = null;

  constructor(
    providers: any,
    router?: LLMRouter,
    config?: AgentConfig
  ) {
    this.providers = providers;
    this.router = router || new LLMRouter();
    this.config = {
      maxSteps: 20,
      workingDirectory: process.cwd(),
      ...config,
    };
    this.session = createSession();
  }

  abort(): void {
    this.abortController?.abort();
  }

  private trimHistory(maxTokens: number = 80_000): void {
    while (estimateChatTokens(historyAsText(this.history)) > maxTokens) {
      const nextUser = this.history.findIndex(
        (m, i) => i > 0 && m.role === "user"
      );
      if (nextUser <= 0) break;
      this.history.splice(0, nextUser);
    }
  }

  async *run(
    userMessage: string
  ): AsyncGenerator<AgentEvent, void, unknown> {
    const dailyBudget = this.config.dailyBudgetUsd;
    if (dailyBudget && dailyBudget > 0) {
      const spent = loadDailySpend();
      if (spent >= dailyBudget) {
        yield {
          type: "error",
          data: {
            error: `Daily budget exhausted: $${spent.toFixed(4)} spent of $${dailyBudget.toFixed(2)} limit. Increase defaults.budget.dailyUsd in yoru.json or wait until tomorrow.`,
          },
        };
        yield {
          type: "done",
          data: {
            session: this.session,
            routing: null,
            usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
            budget: { dailySpentUsd: spent, dailyBudgetUsd: dailyBudget },
          },
        };
        return;
      }
    }

    addMessage(this.session, { role: "user", content: userMessage });
    this.history.push({ role: "user", content: userMessage });
    this.trimHistory();

    const routing = this.router.route({
      messages: historyAsText(this.history),
      needsTools: true,
    });

    yield { type: "routing", data: routing };

    const model = this.providers.getModel(
      routing.model.id,
      routing.model.provider
    );

    const toolCtx: ToolContext = {
      workingDirectory: this.config.workingDirectory!,
      sessionId: this.session.id,
    };

    const tools: Record<string, any> = {};
    for (const t of builtInTools) {
      tools[t.name] = tool({
        description: t.description,
        inputSchema: t.inputSchema,
        execute: async (input: any) => {
          return await t.execute(input, toolCtx);
        },
      });
    }

    this.abortController = new AbortController();
    let step = 0;
    let fullText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let failed = false;

    try {
      const result = streamText({
        model,
        system: this.config.systemPrompt,
        messages: this.history,
        tools,
        stopWhen: stepCountIs(this.config.maxSteps || 20),
        abortSignal: this.abortController.signal,
      });

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "start-step":
            step++;
            yield { type: "thinking", data: { step } };
            break;
          case "text-delta":
            fullText += part.text;
            yield { type: "text", data: { text: part.text } };
            break;
          case "tool-call":
            yield {
              type: "tool_call",
              data: { name: part.toolName, args: part.input },
            };
            break;
          case "tool-result":
            yield {
              type: "tool_result",
              data: { name: part.toolName, result: part.output },
            };
            break;
          case "tool-error":
            yield {
              type: "tool_result",
              data: { name: part.toolName, result: String(part.error) },
            };
            break;
          case "error":
            failed = true;
            yield {
              type: "error",
              data: {
                error:
                  part.error instanceof Error
                    ? part.error.message
                    : String(part.error),
              },
            };
            break;
        }
      }

      if (!failed) {
        const response = await result.response;
        this.history.push(...response.messages);
        const usage = await result.usage;
        inputTokens = usage.inputTokens ?? 0;
        outputTokens = usage.outputTokens ?? 0;
      }
    } catch (error) {
      failed = true;
      yield {
        type: "error",
        data: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    } finally {
      this.abortController = null;
    }

    const costUsd = failed
      ? 0
      : calculateCost(routing.model, inputTokens, outputTokens);

    if (fullText) {
      addMessage(this.session, {
        role: "assistant",
        content: fullText,
        model: routing.model.id,
        cost: costUsd,
      });
    }

    compactSession(this.session);

    const dailySpentUsd = recordSpend(costUsd);

    yield {
      type: "done",
      data: {
        session: this.session,
        routing,
        usage: { inputTokens, outputTokens, costUsd },
        budget: { dailySpentUsd, dailyBudgetUsd: dailyBudget ?? 0 },
      },
    };
  }

  getSession(): Session {
    return this.session;
  }
}
