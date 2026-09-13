export { createTool, type ToolDefinition, type ToolContext, type ToolResult } from "./types";
export { readFileTool } from "./read-file";
export { writeFileTool } from "./write-file";
export { editTool } from "./edit-file";
export { bashTool } from "./bash";
export { grepTool } from "./grep";
export { globTool } from "./glob";

import { readFileTool } from "./read-file";
import { writeFileTool } from "./write-file";
import { editTool } from "./edit-file";
import { bashTool } from "./bash";
import { grepTool } from "./grep";
import { globTool } from "./glob";
import type { ToolDefinition } from "./types";

export const builtInTools: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  editTool,
  bashTool,
  grepTool,
  globTool,
];
