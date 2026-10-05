export type PermissionMode = "allow" | "deny" | "ask";

export interface PermissionsConfig {
  default?: PermissionMode;
  tools?: Record<string, PermissionMode>;
}

export const DEFAULT_TOOL_PERMISSIONS: Record<string, PermissionMode> = {
  read_file: "allow",
  grep: "allow",
  glob: "allow",
  write_file: "ask",
  edit_file: "ask",
  bash: "ask",
  webfetch: "ask",
  task: "ask",
};

export function resolvePermission(
  toolName: string,
  config?: PermissionsConfig
): PermissionMode {
  return (
    config?.tools?.[toolName] ??
    DEFAULT_TOOL_PERMISSIONS[toolName] ??
    config?.default ??
    "ask"
  );
}
