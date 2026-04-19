# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Model Router is a local routing system that wraps ccproxy to intelligently select between Claude models (Haiku, Sonnet, Opus) based on task characteristics. It adds logging, auto-escalation on failure, outcome scoring, and adaptive learning on top of ccproxy's static rules.

## Architecture

```
Request → ccproxy (routing rules) → model execution
                ↕
        router layer (logging, escalation, scoring)
                ↕
        SQLite (decisions, outcomes, stats)
```

Key layers:
- **proxy/** — ccproxy configuration and rule definitions
- **router/** — core logic: request logging, auto-escalation, outcome scoring
- **data/** — SQLite schema and queries for decision/outcome storage
- **cli/** — stats and analysis commands

## Build & Dev Commands

```bash
npm install          # install dependencies
npm run build        # compile TypeScript
npm run proxy        # start routing proxy on port 8080
npm test             # run all tests (9 tests: router + integration)
npm run cli stats    # view routing stats
npm run cli decisions  # view recent decisions
npm run cli rules    # view routing rules
npx tsx examples/basic.ts  # run example
```

## Using the Proxy

Start proxy: `npm run proxy`
Configure Claude Code: `export ANTHROPIC_BASE_URL=http://localhost:8080`
All requests will be routed through the proxy automatically.

## Tech Stack

- TypeScript (ESM)
- SQLite (via better-sqlite3) for local persistence
- ccproxy as the underlying routing proxy
- Vitest for testing

## Key Design Decisions

- All routing decisions are logged with full context for later analysis
- Auto-escalation: if a model fails, retry on next tier (Haiku → Sonnet → Opus)
- Outcome scoring happens asynchronously — doesn't block the response
- No external infrastructure required — everything runs locally
