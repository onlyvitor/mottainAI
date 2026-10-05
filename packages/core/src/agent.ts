import { streamText, stepCountIs, tool, type ModelMessage } from "ai";
import {
  LLMRouter,
  calculateCost,
  estimateChatTokens,
  getModel as getCatalogModel,
  type ModelPricing,
  type RoutingDecision,
} from "@mottainai/router";
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
  private depth: number;

  constructor(
    providers: any,
    router?: LLMRouter,
    config?: AgentConfig,
    depth: number = 0
  ) {
    this.providers = providers;
    this.router = router || new LLMRouter();
    this.config = {
      maxSteps: 20,
      workingDirectory: process.cwd(),
      ...config,
    };
    this.session = createSession();
    this.depth = depth;
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

  private buildAttempts(routing: RoutingDecision): ModelPricing[] {
    const attempts: ModelPricing[] = [routing.model];
    const seen = new Set([routing.model.id]);

    for (const id of routing.fallback) {
      if (seen.has(id)) continue;
      const model = getCatalogModel(id);
      if (!model) continue;
      if (this.providers.hasProvider?.(model.provider) === false) continue;
      seen.add(id);
      attempts.push(model);
    }

    return attempts;
  }

  private async runSubagent(prompt: string): Promise<string> {
    const sub = new Agent(
      this.providers,
      this.router,
      {
        maxSteps: Math.min(this.config.maxSteps ?? 20, 10),
        workingDirectory: this.config.workingDirectory,
        systemPrompt:
          "You are a subagent completing a delegated task. Work autonomously, use tools as needed, and end with a single final message summarizing the result. Do not ask questions.",
        dailyBudgetUsd: this.config.dailyBudgetUsd,
      },
      this.depth + 1
    );

    let stepText = "";
    let finalText = "";
    let lastError = "";

    for await (const event of sub.run(prompt)) {
      switch (event.type) {
        case "thinking":
          stepText = "";
          break;
        case "text":
          stepText += event.data.text;
          finalText = stepText;
          break;
        case "error":
          lastError = event.data.error;
          break;
      }
    }

    if (!finalText && lastError) {
      throw new Error(lastError);
    }

    return finalText;
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

    const toolCtx: ToolContext = {
      workingDirectory: this.config.workingDirectory!,
      sessionId: this.session.id,
      spawnSubagent:
        this.depth < 1 ? (prompt) => this.runSubagent(prompt) : undefined,
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

    const attempts = this.buildAttempts(routing);

    let succeeded = false;
    let aborted = false;
    let lastError = "";
    let usedModel = routing.model;
    let fullText = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for (const [attemptIndex, attemptModel] of attempts.entries()) {
      const breaker = this.router.getBreaker(attemptModel.id);
      if (
        breaker &&
        !breaker.isAvailable() &&
        attemptIndex < attempts.length - 1
      ) {
        continue;
      }

      if (attemptIndex > 0) {
        yield {
          type: "routing",
          data: {
            ...routing,
            model: attemptModel,
            reason: `Fallback after error: ${lastError}`,
          },
        };
      }

      let step = 0;
      fullText = "";
      let failed = false;
      this.abortController = new AbortController();

      try {
        const model = this.providers.getModel(
          attemptModel.id,
          attemptModel.provider
        );

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
              lastError =
                part.error instanceof Error
                  ? part.error.message
                  : String(part.error);
              break;
          }
        }

        if (this.abortController.signal.aborted) {
          aborted = true;
          break;
        }

        if (!failed) {
          const response = await result.response;
          this.history.push(...response.messages);
          const usage = await result.usage;
          inputTokens = usage.inputTokens ?? 0;
          outputTokens = usage.outputTokens ?? 0;
          breaker?.recordSuccess();
          usedModel = attemptModel;
          succeeded = true;
        } else {
          breaker?.recordFailure();
        }
      } catch (error) {
        if (this.abortController?.signal.aborted) {
          aborted = true;
          break;
        }
        failed = true;
        lastError = error instanceof Error ? error.message : String(error);
        breaker?.recordFailure();
      } finally {
        this.abortController = null;
      }

      if (succeeded || aborted) break;
    }

    if (aborted) {
      yield { type: "error", data: { error: "Cancelled by user" } };
    } else if (!succeeded) {
      yield {
        type: "error",
        data: { error: lastError || "All model attempts failed" },
      };
    }

    const costUsd = succeeded
      ? calculateCost(usedModel, inputTokens, outputTokens)
      : 0;

    if (succeeded && fullText) {
      addMessage(this.session, {
        role: "assistant",
        content: fullText,
        model: usedModel.id,
        cost: costUsd,
      });
    }

    compactSession(this.session);

    const dailySpentUsd = recordSpend(costUsd);

    yield {
      type: "done",
      data: {
        session: this.session,
        routing: succeeded ? { ...routing, model: usedModel } : null,
        usage: { inputTokens, outputTokens, costUsd },
        budget: { dailySpentUsd, dailyBudgetUsd: dailyBudget ?? 0 },
      },
    };
  }

  getSession(): Session {
    return this.session;
  }
}
