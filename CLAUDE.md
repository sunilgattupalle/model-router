# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Model Router is a local routing system that uses a Claude Code `UserPromptSubmit` hook to intelligently select between Claude models (Haiku, Sonnet, Opus) based on prompt characteristics. It writes the selected model to `~/.claude/settings.json`, which Claude Code hot-reloads. All decisions are logged to SQLite for analytics.

## Architecture

```
User prompt → UserPromptSubmit hook (src/hook.ts)
                    ↓
              Analyze prompt → select model (Haiku/Sonnet/Opus)
                    ↓
              Write model to ~/.claude/settings.json
                    ↓
              Log decision to SQLite
                    ↓
              Claude Code uses selected model
```

Key source files:
- **src/hook.ts** -- UserPromptSubmit hook entry point, prompt analysis, model selection
- **src/router.ts** -- Rules engine, config loading
- **src/logger.ts** -- Decision and outcome logging to SQLite
- **src/db.ts** -- SQLite setup and migrations
- **src/stats.ts** -- Stats calculation and formatting
- **src/cli.ts** -- CLI commands (stats, decisions, rules)
- **src/dashboard.ts** -- Web dashboard server
- **src/proxy.ts** -- Legacy proxy mode (alternative to hook)
- **config.yaml** -- Routing rules configuration

## Build & Dev Commands

```bash
npm install          # install dependencies
npm run build        # compile TypeScript
npm test             # run all tests
npm run dashboard    # start web dashboard on port 3000
npm run cli stats    # view routing stats
npm run cli decisions  # view recent decisions
npm run cli rules    # view routing rules
npm run proxy        # start legacy proxy on port 8080
```

## Hook Setup

The hook is configured in `.claude/settings.json` (project-level):
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "node /path/to/model-router/dist/hook.js"
      }
    ]
  }
}
```

## Tech Stack

- TypeScript (ESM)
- SQLite (via better-sqlite3) for local persistence
- Claude Code hooks API (UserPromptSubmit)
- Vitest for testing

## Key Design Decisions

- Hook-based integration avoids the complexity of running a proxy server
- Model selection writes to `~/.claude/settings.json` which Claude Code hot-reloads
- All routing decisions are logged with full context for later analysis
- Prompt analysis uses keyword matching for speed (runs synchronously before each prompt)
- No external infrastructure required -- everything runs locally
