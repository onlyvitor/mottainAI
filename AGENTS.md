# YoruCode — Agent Instructions

## Stack (decided, do not re-litigate)

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Bun** | ESM native, fast, built-in bundler |
| Language | **TypeScript (ESM)** | AI SDK ecosystem, typed schemas |
| LLM SDK | **Vercel AI SDK** (`ai`) | Multi-provider unified API, streaming, tool calling |
| TUI | **Ink** (React for CLI) | Used by Claude Code, Gemini CLI, OpenCode |
| Schema | **Zod** | AI SDK integration, tool validation + structured output |
| Monorepo | **Bun workspaces** | Simple, no Turborepo overhead |

## Architecture

```
yorucode/
├── packages/
│   ├── core/          # Agent loop, session, context management
│   ├── cli/           # Ink TUI + CLI entry point (bin)
│   ├── router/        # Cost routing engine (14-dim scorer)
│   ├── providers/     # LLM provider adapters
│   ├── tools/         # Built-in tools (read, write, edit, bash, grep, glob)
│   └── sdk/           # Public API for extensions
├── yoru.json          # User config: routing rules, budget, model prefs
└── package.json       # Workspace root
```

## Router Design

The router is the core differentiator. Three-layer decision:

1. **Complexity Classifier** — 14-dimension keyword scoring (ClawRouter-style), <1ms, no LLM call
2. **Cost Selection** — Pick cheapest capable model within tier, respecting budget
3. **Cascade Fallback** — Cheap first → verify quality → escalate if rejected

Model tiers:
- **SIMPLE** (60% traffic): DeepSeek V4 Flash ($0.14/M), Gemini 2.5 Flash ($0.30/M)
- **MEDIUM** (30%): Gemini 3.1 Pro ($1.38/M), Claude Sonnet 5 ($2.00/M)
- **COMPLEX/REASONING** (10%): Claude Opus 4.8 ($5.00/M)

User config in `yoru.json` — rules override auto-routing (priority-ordered, first match wins).

## Agent Pattern

ReAct loop via Vercel AI SDK:
- **Macro loop**: conversation steps, context compaction, subagent spawning
- **Micro loop**: `streamText()` → tool calls → execute → result → repeat
- **Stop conditions**: `isStepCount(20)`, `hasToolCall('done')`, user abort
- **Permissions**: per-tool allow/deny/ask gates

Tools: `read`, `write`, `edit`, `bash`, `grep`, `glob`, `webfetch`, `task` (subagent)

## Commands

```bash
bun install
bun run dev        # Start dev TUI
bun run build      # Build all packages
bun run lint       # Lint all packages
bun run typecheck  # Type-check all packages
```

## Conventions

- ESM only (`"type": "module"`)
- No comments in code unless requested
- Zod schemas for all tool inputs and structured outputs
- Tool files paired with `.txt` description files (system prompts for LLM)
- Permission rules defined per-agent in config
- Pricing registry must be kept current (update when providers change prices)
