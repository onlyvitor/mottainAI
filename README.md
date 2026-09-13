# mottainAI

<img src="https://pbs.twimg.com/media/HSEJyF_X0AYXlno?format=jpg&name=large" alt="AI girls" width=500px style="display: block; margin: left auto; margin-right: auto;">

Terminal-based AI coding assistant with cost-aware model routing.

## Overview

mottainAI is a CLI interface for AI-assisted coding that routes LLM requests to different models based on task complexity. The system analyzes each prompt using a 14-dimension keyword classifier and selects the cheapest capable model for the job.

This project was developed as a personal experiment exploring software development with assistance from language models—not as a demonstration that AI replaces developers, but as a practical exploration of human-AI collaborative development.

## What It Does

The core feature is **complexity-based routing**: before sending any request to an LLM, the system classifies the task into one of four tiers:

- **SIMPLE** — Quick queries, definitions, basic questions → cheapest available models
- **MEDIUM** — Code generation, refactoring, standard tasks → mid-tier models
- **COMPLEX** — Multi-step tasks requiring reasoning → premium models
- **REASONING** — Mathematical proofs, architectural decisions → top-tier models

The classification happens locally through keyword matching across 14 dimensions (reasoning markers, code presence, technical terms, output formats, etc.) without any LLM call.

## Current Features

### Implemented

- **Model routing** with tiered selection and cost estimation
- **Multi-provider support** via Vercel AI SDK (OpenAI, Anthropic, Google, DeepSeek)
- **Tool calling** with 6 built-in tools: read, write, edit, bash, grep, glob
- **Session management** with message history and compaction
- **Circuit breaker** pattern for model reliability
- **Configuration system** via `yoru.json` with routing rules
- **Terminal UI** using Ink (React for CLI) with streaming responses

### Architecture

```
packages/
├── cli/           # Ink TUI + CLI entry point (yargs-based)
├── core/          # Agent loop, session management, event streaming
├── router/        # Complexity scorer, pricing registry, routing logic
├── providers/     # LLM provider adapters using Vercel AI SDK
├── tools/         # Built-in tool implementations with Zod validation
└── sdk/           # Public API for extensions (currently empty)
```

## Technical Highlights

### 14-Dimension Complexity Scorer

The router uses weighted keyword matching across 14 categories:

| Dimension         | Weight | Example Keywords                           |
| ----------------- | ------ | ------------------------------------------ |
| reasoningMarkers  | 0.18   | "prove", "theorem", "induction"            |
| codePresence      | 0.15   | "function", "class", "```"                 |
| multiStepPatterns | 0.12   | "first", "then", "step 1"                  |
| technicalTerms    | 0.10   | "algorithm", "distributed", "polymorphism" |
| agenticTask       | 0.04   | "edit", "deploy", "refactor"               |
| outputFormat      | 0.03   | "json", "yaml", "csv"                      |

This rule-based approach runs locally in milliseconds, avoiding the latency and cost of using an LLM for routing decisions.

### Circuit Breaker for Model Reliability

Each model has an associated circuit breaker that tracks failures. If a model fails repeatedly, the router stops selecting it until it recovers. This provides resilience against temporary provider outages or rate limits.

### Tool System with Zod Validation

All tools use Zod schemas for input validation:

- `read_file` — Read with optional offset/limit
- `write_file` — Write with automatic directory creation
- `edit_file` — String replacement with uniqueness checking
- `bash` — Shell execution with configurable timeout
- `grep` — Pattern search with file filtering
- `glob` — File pattern matching

### Event-Driven Agent Loop

The agent implements a ReAct pattern with async event streaming:

- Events flow through an async generator for real-time UI updates
- Tool calls and results are emitted as discrete events
- Session compaction keeps only recent messages to limit context window

## Development with AI Assistance

This project was developed with assistance from a language model as an experiment in human-AI collaborative development. The model helped with:

- Code structure and implementation patterns
- Refactoring and debugging
- Documentation generation

**Important**: This does not mean the project was "written by AI." Human judgment remained central to architectural decisions, design choices, and quality control. The experiment aimed to understand where AI assistance accelerates development and where human expertise remains essential.

The repository does not contain specific documentation about which parts were AI-assisted versus human-written, as this was not tracked during development.

## Current Limitations

- **No explicit permission gates** for file operations (all tool executions proceed without confirmation)
- **Session replay/resumption** not implemented
- **Budget enforcement** exists in schema but is minimal in practice
- **Custom provider support** (Ollama, local models) not integrated
- **No testing framework** for agent logic or tools
- **SDK package** is empty — extension API not yet implemented

## Usage

```bash
# Install dependencies
bun install

# Start the TUI
bun run dev

# Type-check all packages
bun run typecheck

# Lint all packages
bun run lint
```

Configure providers in `yoru.json`:

```json
{
  "providers": {
    "openai": { "apiKey": "sk-..." },
    "anthropic": { "apiKey": "sk-ant-..." },
    "google": { "apiKey": "..." },
    "deepseek": { "apiKey": "..." }
  },
  "defaults": {
    "tier": "MEDIUM",
    "budget": { "dailyUsd": 10, "perRequestUsd": 0.1 }
  },
  "rules": []
}
```

## Tech Stack

| Layer    | Technology     | Rationale                                  |
| -------- | -------------- | ------------------------------------------ |
| Runtime  | Bun            | ESM native, fast startup, built-in bundler |
| Language | TypeScript     | Type safety, AI SDK ecosystem              |
| LLM SDK  | Vercel AI SDK  | Unified API for multiple providers         |
| TUI      | Ink            | React-based terminal interfaces            |
| Schema   | Zod            | Tool validation and type inference         |
| Monorepo | Bun workspaces | Simple setup without Turborepo overhead    |

## Project Status

This is a **personal experiment** demonstrating:

- Local complexity classification before LLM calls
- Cost-aware model selection
- Terminal-based AI assistant architecture
- Circuit breaker patterns for external services

It is not production-ready and serves primarily as a learning project and architecture exploration.

## License

MIT
