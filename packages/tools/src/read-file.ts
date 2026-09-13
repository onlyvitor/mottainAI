import { z } from "zod";
import { createTool, type ToolResult } from "./types";
import { readFile as readFileFn } from "node:fs/promises";
import { resolve } from "node:path";

export const readFileTool = createTool({
  name: "read_file",
  description:
    "Read the contents of a file. Returns the full content or a specific range of lines.",
  inputSchema: z.object({
    path: z.string().describe("File path relative to working directory"),
    offset: z
      .number()
      .optional()
      .describe("Start line (1-indexed)"),
    limit: z.number().optional().describe("Max lines to return"),
  }),
  async execute(input, ctx): Promise<ToolResult> {
    try {
      const fullPath = resolve(ctx.workingDirectory, input.path);
      const content = await readFileFn(fullPath, "utf-8");

      const lines = content.split("\n");
      const start = input.offset ? input.offset - 1 : 0;
      const end = input.limit ? start + input.limit : lines.length;
      const sliced = lines.slice(start, end);

      return {
        success: true,
        output: sliced.join("\n"),
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
