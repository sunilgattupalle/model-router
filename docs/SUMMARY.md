# Model Router -- Summary

**Status**: Ready to use
**Date**: 2026-04-19

## What It Does

A Claude Code hook that automatically selects the optimal model (Haiku, Sonnet, or Opus) for each prompt based on task complexity. Reduces costs by routing simple tasks to cheaper models while reserving expensive models for complex work.

## How It Works

1. A `UserPromptSubmit` hook (`src/hook.ts`) runs before each prompt
2. The hook analyzes the prompt text (keywords, length, complexity signals)
3. It selects a model tier: Haiku (simple), Sonnet (standard), Opus (complex)
4. It writes the model to `~/.claude/settings.json`
5. Claude Code hot-reloads the setting and uses the selected model
6. The decision is logged to SQLite for analytics

## How to Use It

```bash
npm install && npm run build
```

Configure the hook in `.claude/settings.json`:
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

Start a Claude Code session. Model switches happen automatically.

Monitor with:
```bash
npm run dashboard      # Web UI at http://localhost:3000
npm run cli stats      # Terminal stats
```

## Components

| Component | File | Purpose |
|-----------|------|---------|
| Hook | `src/hook.ts` | Prompt analysis, model selection, settings write |
| Router | `src/router.ts` | Rules engine, config loading |
| Logger | `src/logger.ts` | SQLite logging of decisions/outcomes |
| Escalator | `src/escalator.ts` | Auto-retry on failure (proxy mode) |
| Stats | `src/stats.ts` | Cost analysis, savings calculation |
| Database | `src/db.ts` | SQLite setup and migrations |
| CLI | `src/cli.ts` | Command-line tools |
| Dashboard | `src/dashboard.ts` | Web dashboard server |
| Proxy | `src/proxy.ts` | Legacy proxy mode (alternative) |
| Config | `config.yaml` | Routing rules |

## What's Next

- **Phase 2**: Train a classifier on collected decision data for smarter routing
- **Phase 3**: Contextual bandit for adaptive, self-improving routing
