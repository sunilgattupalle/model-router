# Model Router — Technical Spec

## Goals

- Reduce Claude Code costs 20-30% by routing simple tasks to cheaper models
- Maintain quality by auto-escalating when cheaper models fail
- Collect outcome data to improve routing over time

## System Design

### Components

1. **Routing Proxy** (ccproxy)
   - Sits between Claude Code and the API
   - Applies rules to select model tier
   - Rules defined in `config.yaml`

2. **Decision Logger**
   - Records every routing decision: timestamp, prompt hash, model selected, rule matched, token estimate
   - Writes to SQLite

3. **Outcome Tracker**
   - After response: logs tokens used, latency, response status
   - After execution: logs whether task succeeded (test pass, lint pass, no retry)
   - Correlates outcomes back to decisions

4. **Auto-Escalator**
   - Detects failure signals: API errors, empty responses, immediate retries
   - Automatically retries on next model tier
   - Logs escalation events

5. **Stats CLI**
   - `model-router stats` — cost breakdown by model, escalation rate, savings estimate
   - `model-router decisions` — recent routing decisions with outcomes
   - `model-router rules` — show current rules and their hit rates

### Routing Rules (Phase 1)

```yaml
rules:
  - name: simple-queries
    conditions:
      - prompt_tokens < 500
      - no_tool_use: true
    model: haiku
    
  - name: multi-file-edits
    conditions:
      - tool_count > 3
      - file_count > 2
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

### Auto-Escalation Flow

```
Request → Rule selects Haiku
       → Execute on Haiku
       → Failure detected (error / empty / timeout)
       → Log escalation
       → Retry on Sonnet
       → Success → Log outcome
```

Max escalation depth: 2 (Haiku → Sonnet → Opus, then fail)

## Success Metrics

- Cost per task (USD)
- Escalation rate (target: < 15%)
- Task success rate (target: >= baseline with Sonnet-only)
- p95 latency

## Implementation Order

1. Project scaffolding (package.json, tsconfig, structure)
2. ccproxy config with 3 basic rules
3. Decision logger + SQLite schema
4. Outcome tracker (token count, latency, status)
5. Auto-escalation logic
6. Stats CLI
7. Integration test: route a request end-to-end

## Non-Goals (for now)

- Training a classifier (Phase 2 — needs data first)
- Contextual bandit (Phase 3)
- Web dashboard (CLI is sufficient)
- Multi-provider routing (Claude-only for now)
