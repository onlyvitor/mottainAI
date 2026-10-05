import { z } from "zod";
import { createTool, type ToolResult } from "./types";

export const taskTool = createTool({
  name: "task",
  description:
    "Launch a subagent to handle a complex, multi-step task autonomously. The subagent has access to the same tools, works in its own session, and returns a single final result message. Use for open-ended searches or delegated units of work.",
  inputSchema: z.object({
    description: z
      .string()
      .describe("Short (3-5 words) description of the task"),
    prompt: z
      .string()
      .describe(
        "Detailed, self-contained task description for the subagent to perform"
      ),
  }),
  async execute(input, ctx): Promise<ToolResult> {
    if (!ctx.spawnSubagent) {
      return {
        success: false,
        output: "",
        error: "Subagents are not available in this context",
      };
    }

    try {
      const result = await ctx.spawnSubagent(input.prompt);
      return { success: true, output: result || "(subagent returned no result)" };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: `Subagent failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
