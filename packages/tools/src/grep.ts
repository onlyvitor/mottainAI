import { z } from "zod";
import { createTool, type ToolResult } from "./types";
import { spawn } from "node:child_process";

export const grepTool = createTool({
  name: "grep",
  description:
    "Search for a regex pattern in files. Returns matching lines with file paths and line numbers.",
  inputSchema: z.object({
    pattern: z.string().describe("Regex pattern to search for"),
    path: z
      .string()
      .optional()
      .default(".")
      .describe("Directory or file to search in"),
    include: z
      .string()
      .optional()
      .describe("File pattern to include (e.g., '*.ts')"),
  }),
  async execute(input, ctx): Promise<ToolResult> {
    return new Promise((resolve) => {
      const args = [
        "-rn",
        "--color=never",
        input.pattern,
        input.path,
      ];

      if (input.include) {
        args.splice(1, 0, "--include", input.include);
      }

      const proc = spawn("grep", args, {
        cwd: ctx.workingDirectory,
        timeout: 10_000,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve({
            success: true,
            output: stdout.trim() || "(no matches)",
          });
        } else if (code === 1) {
          resolve({
            success: true,
            output: "(no matches found)",
          });
        } else {
          resolve({
            success: false,
            output: "",
            error: stderr || `grep exited with code ${code}`,
          });
        }
      });

      proc.on("error", (error) => {
        resolve({
          success: false,
          output: "",
          error: `Failed to execute grep: ${error.message}`,
        });
      });
    });
  },
});
