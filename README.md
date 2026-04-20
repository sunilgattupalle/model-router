# Model Router

Intelligent, adaptive model routing for Claude Code with pluggable strategies and feedback loops.

## Overview

Model Router automatically selects the optimal Claude model (Haiku/Sonnet/Opus) for each prompt using pluggable routing strategies. It learns from outcomes and adapts over time through a feedback loop.

## Core Concepts

### 1. Routing Strategies (Pluggable)

Routing is **not** a single algorithm. The system supports multiple strategies:

| Strategy | How It Works | Latency | Cost | Accuracy |
|----------|--------------|---------|------|----------|
| **rule-based** | Keyword matching + heuristics | ~1ms | Free | Good |
| **ml-classifier** | Logistic regression on historical data | ~5ms | Free | Better* |
| **llm-routing** | LLM analyzes prompt complexity | ~200ms | ~$0.001/route | Best |

*\*Requires training data from past decisions*

Configure via `config.yaml`:
```yaml
routing:
  strategy: rule-based  # or ml-classifier, llm-routing
```

### 2. The Feedback Loop

```
┌─────────────────────────────────────────────────────┐
│  BEFORE Turn: UserPromptSubmit Hook                 │
│  1. Extract features from prompt                    │
│  2. Route using selected strategy                   │
│  3. Check recent failure rate → escalate if needed  │
│  4. Write model to ~/.claude/settings.json          │
│  5. Log decision to SQLite                          │
└─────────────────────────────────────────────────────┘
                        ↓
                   User Turn
                        ↓
┌─────────────────────────────────────────────────────┐
│  AFTER Turn: Stop Hook                              │
│  1. Parse transcript for tool outcomes              │
│  2. Score: success / error / partial                │
│  3. Log outcome (tokens, latency, cost)             │
│  4. Record model performance                        │
└─────────────────────────────────────────────────────┘
                        ↓
            Feedback influences next route
```

### 3. Core Abstractions

#### RoutingStrategy (Abstract Base)
```typescript
abstract class RoutingStrategy {
  abstract name: string;
  abstract route(features: PromptFeatures): Promise<RoutingDecision>;
}
```

All strategies implement this interface. Add new strategies by extending this class.

#### PromptFeatures
```typescript
interface PromptFeatures {
  prompt: string;
  wordCount: number;
  hasQuestion: boolean;
  hasActionVerb: boolean;
  hasComplexSignal: boolean;
  estimatedTokens: number;
}
```

Extracted from the raw prompt before routing.

#### RoutingDecision
```typescript
interface RoutingDecision {
  model: "haiku" | "sonnet" | "opus";
  reasoning: string;
  confidence: number;  // 0.0 - 1.0
}
```

The output of any routing strategy.

#### Adaptive Escalation

If a model has >40% failure rate in the last 30 minutes, automatically escalate:
- Haiku → Sonnet
- Sonnet → Opus
- Opus → (no escalation)

## Quick Start

```bash
git clone https://github.com/sunilgattupalle/model-router.git
cd model-router
npm install
npm run build

# Start Claude Code in this directory
claude

# (Optional) Start dashboard
npm run dashboard  # http://localhost:3000
```

The hooks activate automatically in any Claude Code session within this directory.

## Configuration

Edit `config.yaml`:

```yaml
# Model definitions (Bedrock format)
models:
  haiku:
    id: global.anthropic.claude-haiku-4-5-20251001-v1:0
    cost_per_1k_input: 0.001
    cost_per_1k_output: 0.005
  sonnet:
    id: global.anthropic.claude-sonnet-4-5-20250929-v1:0
    cost_per_1k_input: 0.003
    cost_per_1k_output: 0.015
  opus:
    id: global.anthropic.claude-opus-4-6-v1
    cost_per_1k_input: 0.015
    cost_per_1k_output: 0.075

# Choose routing strategy
routing:
  strategy: rule-based  # rule-based | ml-classifier | llm-routing

# Adaptive escalation
escalation:
  enabled: true
  max_depth: 2
  triggers:
    - api_error
    - empty_response
    - timeout
```

## Extending: Add a New Routing Strategy

1. **Create a new strategy file** in `src/strategies/`:

```typescript
// src/strategies/my-strategy.ts
import { RoutingStrategy, type RoutingDecision, type PromptFeatures } from "./base.js";

export class MyStrategy extends RoutingStrategy {
  name = "my-strategy";

  async route(features: PromptFeatures): Promise<RoutingDecision> {
    // Your routing logic here
    const model = someLogic(features.prompt);
    return {
      model,
      reasoning: "custom logic applied",
      confidence: 0.8,
    };
  }
}
```

2. **Export from `src/strategies/index.ts`**:

```typescript
export { MyStrategy } from "./my-strategy.js";
```

3. **Update hook.ts to load your strategy**:

```typescript
import { MyStrategy } from "./strategies/index.js";

// In loadStrategy():
case "my-strategy":
  return new MyStrategy();
```

4. **Configure in `config.yaml`**:

```yaml
routing:
  strategy: my-strategy
```

## Strategy Comparison

### Rule-Based (Default)
- **Best for**: Real-time, zero-latency routing
- **Works well**: Simple prompts, clear keywords
- **Struggles**: Subtle complexity, context-dependent tasks

### ML Classifier
- **Best for**: Learning from historical patterns
- **Works well**: After 50+ decisions with outcomes
- **Struggles**: Cold start (no training data), novel tasks

### LLM Routing
- **Best for**: Maximum accuracy, high-stakes decisions
- **Works well**: Ambiguous or nuanced prompts
- **Struggles**: Latency-sensitive applications, cost-constrained use cases

## CLI Tools

```bash
# View statistics
npm run cli stats

# Recent routing decisions
npm run cli decisions

# Rule hit rates
npm run cli rules
```

## Dashboard

```bash
npm run dashboard
# Open http://localhost:3000
```

Shows:
- Active model
- Request count, cost, escalation rate
- Model-by-model breakdown
- Recent decisions with outcomes
- Routing rules

## Architecture

### File Structure

```
src/
├── hook.ts              # UserPromptSubmit hook
├── stop-hook.ts         # Stop hook (outcome logging)
├── strategies/
│   ├── base.ts          # Abstract base class
│   ├── rule-based.ts    # Keyword heuristics
│   ├── ml-classifier.ts # Logistic regression
│   └── llm-routing.ts   # LLM-powered routing
├── router.ts            # Legacy config loading
├── logger.ts            # SQLite logging
├── db.ts                # Database schema
├── stats.ts             # Analytics
├── cli.ts               # CLI commands
└── dashboard.ts         # Web server

public/                  # Dashboard frontend
docs/                    # Additional documentation
config.yaml              # Configuration
```

### Database Schema

```sql
-- Routing decisions
CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  prompt_hash TEXT,
  prompt_tokens INTEGER,
  model_selected TEXT NOT NULL,
  rule_matched TEXT,
  escalated_from TEXT,
  confidence REAL
);

-- Outcomes
CREATE TABLE outcomes (
  decision_id TEXT PRIMARY KEY,
  tokens_used INTEGER,
  latency_ms INTEGER,
  status TEXT NOT NULL,  -- success | error | partial
  retries INTEGER,
  cost_usd REAL
);

-- Performance tracking
CREATE TABLE model_performance (
  id INTEGER PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt_category TEXT
);
```

## How It Works: End-to-End

1. **You type a prompt** in Claude Code
2. **UserPromptSubmit hook fires** (`src/hook.ts`)
   - Extracts features from prompt
   - Loads configured routing strategy
   - Strategy returns decision (model + reasoning)
   - Checks recent failure rate → escalates if >40%
   - Writes model to `~/.claude/settings.json`
   - Logs decision to SQLite
3. **Claude Code picks up the new model** (hot-reload)
4. **Turn executes** with selected model
5. **Stop hook fires** (`src/stop-hook.ts`)
   - Parses transcript for tool outcomes
   - Scores turn: success/error/partial
   - Logs outcome, cost, latency to SQLite
   - Updates model_performance table
6. **Next prompt**: Failure rate influences routing

## Why Multiple Strategies?

Different use cases need different tradeoffs:

| Use Case | Best Strategy | Why |
|----------|---------------|-----|
| Interactive CLI | rule-based | Zero latency, no API cost |
| Batch processing | ml-classifier | Learns patterns, still fast |
| High-stakes production | llm-routing | Maximum accuracy worth the cost |
| Cost-conscious | rule-based | Free, good enough for most tasks |
| Learning over time | ml-classifier | Improves with more data |

You can even **combine strategies**: use rule-based by default, fall back to LLM routing when confidence < 0.5.

## Customization Examples

### Example 1: Cost-Optimized Strategy

```typescript
export class CostOptimizedStrategy extends RoutingStrategy {
  name = "cost-optimized";

  async route(features: PromptFeatures): Promise<RoutingDecision> {
    // Bias toward cheaper models
    if (features.estimatedTokens < 200) {
      return { model: "haiku", reasoning: "cost-optimized: small prompt", confidence: 0.9 };
    }
    return { model: "sonnet", reasoning: "cost-optimized: default", confidence: 0.7 };
  }
}
```

### Example 2: Time-of-Day Strategy

```typescript
export class TimeBasedStrategy extends RoutingStrategy {
  name = "time-based";

  async route(features: PromptFeatures): Promise<RoutingDecision> {
    const hour = new Date().getHours();
    // Use Opus during business hours, Haiku off-hours
    const model = hour >= 9 && hour <= 17 ? "opus" : "haiku";
    return { model, reasoning: `time-based: ${hour}:00`, confidence: 0.6 };
  }
}
```

### Example 3: Ensemble Strategy

```typescript
export class EnsembleStrategy extends RoutingStrategy {
  name = "ensemble";
  private strategies: RoutingStrategy[];

  constructor() {
    super();
    this.strategies = [
      new RuleBasedStrategy(),
      new MLClassifierStrategy(),
    ];
  }

  async route(features: PromptFeatures): Promise<RoutingDecision> {
    const decisions = await Promise.all(
      this.strategies.map((s) => s.route(features))
    );

    // Vote: most common model wins
    const votes = decisions.reduce((acc, d) => {
      acc[d.model] = (acc[d.model] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
    return {
      model: winner as "haiku" | "sonnet" | "opus",
      reasoning: "ensemble: majority vote",
      confidence: votes[winner] / this.strategies.length,
    };
  }
}
```

## Contributing

New routing strategies welcome! See "Extending: Add a New Routing Strategy" above.

## License

MIT

## Links

- **Repo**: https://github.com/sunilgattupalle/model-router
- **Claude Code**: https://claude.ai/code
- **Hooks Documentation**: https://code.claude.com/docs/en/hooks
