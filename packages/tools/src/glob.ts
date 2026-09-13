import { z } from "zod";
import { createTool, type ToolResult } from "./types";
import { spawn } from "node:child_process";

export const globTool = createTool({
  name: "glob",
  description:
    "Find files matching a glob pattern. Returns matching file paths.",
  inputSchema: z.object({
    pattern: z.string().describe("Glob pattern (e.g., '**/*.ts', 'src/**/*.test.ts')"),
    path: z
      .string()
      .optional()
      .default(".")
      .describe("Directory to search in"),
  }),
  async execute(input, ctx): Promise<ToolResult> {
    return new Promise((resolve) => {
      const proc = spawn(
        "find",
        [input.path, "-type", "f", "-name", input.pattern],
        {
          cwd: ctx.workingDirectory,
          timeout: 10_000,
          stdio: ["pipe", "pipe", "pipe"],
        }
      );

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0 || stdout) {
          const files = stdout
            .trim()
            .split("\n")
            .filter(Boolean)
            .join("\n");
          resolve({
            success: true,
            output: files || "(no files found)",
          });
        } else {
          resolve({
            success: false,
            output: "",
            error: stderr || "No files found",
          });
        }
      });

      proc.on("error", (error) => {
        resolve({
          success: false,
          output: "",
          error: `Failed to execute glob: ${error.message}`,
        });
      });
    });
  },
});
