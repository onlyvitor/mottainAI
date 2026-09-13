import { z } from "zod";

export interface ToolContext {
  workingDirectory: string;
  sessionId: string;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  execute: (input: any, ctx: ToolContext) => Promise<ToolResult>;
}

export function createTool(
  def: ToolDefinition
): ToolDefinition {
  return def;
}
