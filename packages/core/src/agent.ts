import { generateText, tool, type CoreMessage } from "ai";
import { z } from "zod";
import { LLMRouter, type RoutingDecision } from "@yorucode/router";
import { builtInTools, type ToolContext } from "@yorucode/tools";
import {
  createSession,
  addMessage,
  getMessagesForLLM,
  compactSession,
  type Session,
} from "./session";

export interface AgentConfig {
  maxSteps?: number;
  workingDirectory?: string;
  systemPrompt?: string;
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

export class Agent {
  private router: LLMRouter;
  private config: AgentConfig;
  private session: Session;
  private providers: any;
  private eventQueue: AgentEvent[] = [];
  private eventResolve: ((value: IteratorResult<AgentEvent>) => void) | null =
    null;

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

  private emit(event: AgentEvent): void {
    if (this.eventResolve) {
      const resolve = this.eventResolve;
      this.eventResolve = null;
      resolve({ value: event, done: false });
    } else {
      this.eventQueue.push(event);
    }
  }

  async *run(
    userMessage: string
  ): AsyncGenerator<AgentEvent, void, unknown> {
    addMessage(this.session, { role: "user", content: userMessage });

    const rawMessages = getMessagesForLLM(this.session);
    const llmMessages = rawMessages as CoreMessage[];

    const routing = this.router.route({
      messages: rawMessages,
      needsTools: true,
    });

    this.emit({ type: "routing", data: routing });

    const model = this.providers.getModel(routing.model.id);

    const toolCtx: ToolContext = {
      workingDirectory: this.config.workingDirectory!,
      sessionId: this.session.id,
    };

    const tools: Record<string, any> = {};
    for (const t of builtInTools) {
      tools[t.name] = tool({
        description: t.description,
        parameters: t.inputSchema,
        execute: async (input: any) => {
          const result = await t.execute(input, toolCtx);
          return result;
        },
      });
    }

    let step = 0;
    let fullText = "";

    while (step < (this.config.maxSteps || 20)) {
      this.emit({ type: "thinking", data: { step: step + 1 } });

      try {
        const result = await generateText({
          model,
          messages:
            step === 0
              ? ([
                  ...(this.config.systemPrompt
                    ? [
                        {
                          role: "system" as const,
                          content: this.config.systemPrompt,
                        },
                      ]
                    : []),
                  ...llmMessages,
                ] as CoreMessage[])
              : undefined,
          tools,
          maxSteps: 1,
        });

        if (result.toolCalls && result.toolCalls.length > 0) {
          for (const tc of result.toolCalls) {
            this.emit({
              type: "tool_call",
              data: { name: tc.toolName, args: tc.args },
            });

            const toolResult = result.toolResults?.find(
              (r) => r.toolCallId === tc.toolCallId
            );
            if (toolResult) {
              this.emit({
                type: "tool_result",
                data: { name: tc.toolName, result: toolResult.result },
              });
            }
          }
        }

        if (result.text) {
          fullText += result.text;
          this.emit({ type: "text", data: { text: result.text } });
        }

        if (!result.toolCalls || result.toolCalls.length === 0) {
          break;
        }

        step++;
      } catch (error) {
        this.emit({
          type: "error",
          data: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        break;
      }
    }

    if (fullText) {
      addMessage(this.session, {
        role: "assistant",
        content: fullText,
        model: routing.model.id,
      });
    }

    compactSession(this.session);

    this.emit({
      type: "done",
      data: {
        session: this.session,
        routing,
      },
    });
  }

  getSession(): Session {
    return this.session;
  }
}
