import { z } from "zod";
import { createTool, type ToolResult } from "./types";
import { writeFile as writeFileFn } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { mkdir } from "node:fs/promises";

export const writeFileTool = createTool({
  name: "write_file",
  description:
    "Write content to a file. Creates parent directories if needed.",
  inputSchema: z.object({
    path: z.string().describe("File path relative to working directory"),
    content: z.string().describe("Content to write"),
  }),
  async execute(input, ctx): Promise<ToolResult> {
    try {
      const fullPath = resolve(ctx.workingDirectory, input.path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFileFn(fullPath, input.content, "utf-8");

      return {
        success: true,
        output: `File written: ${input.path} (${input.content.length} chars)`,
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
