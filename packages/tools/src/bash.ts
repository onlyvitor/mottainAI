import { z } from "zod";
import { createTool, type ToolResult } from "./types";
import { spawn } from "node:child_process";

export const bashTool = createTool({
  name: "bash",
  description:
    "Execute a shell command and return its output. Use for running tests, building, git operations, etc.",
  inputSchema: z.object({
    command: z.string().describe("The bash command to execute"),
    timeout: z
      .number()
      .optional()
      .default(30_000)
      .describe("Timeout in milliseconds"),
  }),
  async execute(input, ctx): Promise<ToolResult> {
    return new Promise((resolve) => {
      const proc = spawn("bash", ["-c", input.command], {
        cwd: ctx.workingDirectory,
        timeout: input.timeout,
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
        const output = [stdout, stderr].filter(Boolean).join("\n");
        resolve({
          success: code === 0,
          output: output || "(no output)",
          error: code !== 0 ? `Exit code: ${code}` : undefined,
        });
      });

      proc.on("error", (error) => {
        resolve({
          success: false,
          output: "",
          error: `Failed to execute: ${error.message}`,
        });
      });
    });
  },
});
