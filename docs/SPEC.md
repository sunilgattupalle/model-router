# Model Router -- Technical Spec

## Goals

- Reduce Claude Code costs by routing simple tasks to cheaper models
- Maintain quality by selecting appropriate model tiers per task
- Collect decision data to improve routing over time

## System Design

### Components

1. **UserPromptSubmit Hook** (`src/hook.ts`)
   - Receives every user prompt via Claude Code's hook system
   - Analyzes prompt text to determine complexity
   - Selects optimal model tier (Haiku, Sonnet, Opus)
   - Writes selected model to `~/.claude/settings.json`
   - Claude Code hot-reloads settings, using the selected model for that turn

2. **Decision Logger** (`src/logger.ts`)
   - Records every routing decision: timestamp, prompt hash, model selected, rule matched
   - Writes to SQLite

3. **Outcome Tracker** (`src/logger.ts`)
   - Logs tokens used, latency, response status
   - Correlates outcomes back to decisions

4. **Stats Engine** (`src/stats.ts`)
   - Cost breakdown by model, savings estimate, model distribution
   - Powers both CLI and web dashboard

5. **Web Dashboard** (`src/dashboard.ts`)
   - Real-time stats at `http://localhost:3000`
   - API endpoints: `/api/stats`, `/api/decisions`, `/api/rules`
   - Static HTML/JS frontend in `public/`

6. **CLI Tools** (`src/cli.ts`)
   - `npm run cli stats` -- cost breakdown, savings, model distribution
   - `npm run cli decisions` -- recent routing decisions with outcomes
   - `npm run cli rules` -- current rules and hit rates

### Prompt Analysis

The hook classifies prompts using keyword signals:

- **Opus signals**: refactor, architect, design, security review, migrate, plan, implement system
- **Sonnet signals**: add, update, fix, create, implement, build, change, modify, write, test
- **Haiku**: short prompts (< 30 words) without action keywords
- **Default**: Sonnet

### Routing Rules (config.yaml)

```yaml
rules:
  - name: simple-queries
    conditions:
      prompt_tokens_lt: 500
      no_tool_use: true
    model: haiku

  - name: multi-file-edits
    conditions:
      tool_count_gt: 3
      file_count_gt: 2
    model: opus

  - name: default
    model: sonnet
```

### Database Schema

```sql
CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  timestamp INTEGER,
  prompt_hash TEXT,
  prompt_tokens INTEGER,
  model_selected TEXT,
  rule_matched TEXT,
  escalated_from TEXT,
  confidence REAL
);

CREATE TABLE outcomes (
  decision_id TEXT REFERENCES decisions(id),
  tokens_used INTEGER,
  latency_ms INTEGER,
  status TEXT,  -- success, error, escalated
  retries INTEGER,
  cost_usd REAL
);
```

### Hook Data Flow

```
stdin (JSON) → parse { session_id, prompt, hook_event_name }
            → analyzePrompt(prompt) → { model, reasoning }
            → setModel(model) → write ~/.claude/settings.json
            → stdout (JSON) → { continue: true, additionalContext: "..." }
```

The hook outputs `additionalContext` so Claude sees which model was selected and why.

## Success Metrics

- Cost per task (USD)
- Model distribution (% Haiku / Sonnet / Opus)
- Task success rate (>= Sonnet-only baseline)

## Non-Goals (for now)

- Training a classifier (Phase 2 -- needs data first)
- Contextual bandit (Phase 3)
- Multi-provider routing (Claude-only for now)
