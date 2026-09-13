# Mottainai

AI coding harness with built-in cost routing. Routes every LLM request to the cheapest capable model, saving 40-70% on token spend.

## What it does

Mottainai is a terminal-based AI coding assistant (like aider/opencode) with an integrated cost router that automatically selects the cheapest model for each task:

- **Simple tasks** (formatting, Q&A) → DeepSeek V4 Flash ($0.14/M tokens)
- **Medium tasks** (code generation, refactoring) → Gemini 3.1 Pro ($1.38/M)
- **Complex tasks** (reasoning, architecture) → Claude Opus 4.8 ($5.00/M)

The router uses a 14-dimension complexity classifier that runs in <1ms with no LLM call.

## Features

- Multi-provider support: OpenAI, Anthropic, Google, DeepSeek, Ollama
- Hybrid routing: complexity analysis + user rules + automatic fallback
- Built-in tools: read, write, edit, bash, grep, glob, webfetch
- Subagent spawning for focused tasks
- Real-time cost tracking per session
- Configurable budget limits and routing rules

## Install

```bash
bun install
```

## Usage

```bash
bun run dev        # Start the TUI
```

## Configuration

Create `yoru.json` in your project root:

```json
{
  "defaults": {
    "tier": "MEDIUM",
    "model": "gemini-2.5-flash",
    "budget": { "dailyUsd": 10.00, "perRequestUsd": 0.05 }
  },
  "rules": [
    {
      "name": "force-premium-for-proofs",
      "match": { "promptRegex": ["prove", "theorem"] },
      "action": { "routeTo": "claude-opus-4.8", "maxCost": 0.25 }
    }
  ]
}
```

## Environment

Set API keys for your providers:

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_GENERATIVE_AI_API_KEY=...
export DEEPSEEK_API_KEY=...
```

## Architecture

```
packages/
├── core/          # Agent loop, session, context management
├── cli/           # Ink TUI + CLI entry point
├── router/        # Cost routing engine (14-dim scorer)
├── providers/     # LLM provider adapters
├── tools/         # Built-in tools
└── sdk/           # Public API for extensions
```

## Development

```bash
bun run build      # Build all packages
bun run lint       # Lint all packages
bun run typecheck  # Type-check all packages
```

## License

MIT
