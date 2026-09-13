import { z } from "zod";
import { createTool, type ToolResult } from "./types";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const editTool = createTool({
  name: "edit_file",
  description:
    "Edit a file by replacing exact string matches. Use this for precise modifications.",
  inputSchema: z.object({
    path: z.string().describe("File path relative to working directory"),
    old_string: z
      .string()
      .describe("Exact string to find and replace"),
    new_string: z
      .string()
      .describe("String to replace with (must differ from old_string)"),
  }),
  async execute(input, ctx): Promise<ToolResult> {
    try {
      if (input.old_string === input.new_string) {
        return {
          success: false,
          output: "",
          error: "old_string and new_string are identical",
        };
      }

      const fullPath = resolve(ctx.workingDirectory, input.path);
      const content = await readFile(fullPath, "utf-8");

      const count = content.split(input.old_string).length - 1;
      if (count === 0) {
        return {
          success: false,
          output: "",
          error: `old_string not found in ${input.path}`,
        };
      }
      if (count > 1) {
        return {
          success: false,
          output: "",
          error: `Found ${count} matches for old_string. Provide more context to make it unique.`,
        };
      }

      const updated = content.replace(input.old_string, input.new_string);
      await writeFile(fullPath, updated, "utf-8");

      return {
        success: true,
        output: `Edit applied: ${input.path}`,
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: `Failed to edit file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
