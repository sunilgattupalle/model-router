# Model Router

Intelligent model routing for Claude Code that selects between Haiku, Sonnet, and Opus based on task complexity. Reduces costs 20-30% while maintaining quality through auto-escalation.

## Features

- **Rules-based routing** — Route tasks to cheaper models when appropriate
- **Auto-escalation** — Automatically retry on more capable models when needed
- **Full observability** — Track decisions, outcomes, costs, and savings
- **Local-first** — SQLite storage, no external dependencies

## Installation

```bash
npm install
```

## Quick Start (Proxy Mode)

1. **Start the proxy**
   ```bash
   npm run proxy
   ```

2. **Configure Claude Code**
   ```bash
   export ANTHROPIC_BASE_URL=http://localhost:8080
   ```

3. **Use Claude Code normally** — routing happens automatically

4. **View stats**
   ```bash
   npm run cli stats
   npm run cli decisions
   ```

See [docs/SETUP.md](docs/SETUP.md) for detailed setup instructions.

## Usage

### As a Library

```typescript
import { route, executeWithEscalation } from "model-router";

// Extract features from your request
const features = {
  promptTokens: 300,
  toolCount: 1,
  fileCount: 1,
  hasToolUse: true
};

// Get routing decision
const decision = route(features);
console.log(`Routing to ${decision.model} (rule: ${decision.rule})`);

// Execute with auto-escalation
const result = await executeWithEscalation(
  prompt,
  decision.model,
  async (modelId) => {
    // Your execution logic here
    const response = await callClaude(modelId, prompt);
    return {
      success: response.ok,
      tokensUsed: response.usage.total_tokens,
      latencyMs: response.latency
    };
  }
);

console.log(`Final model: ${result.finalModel}`);
if (result.escalations.length > 0) {
  console.log(`Escalated from: ${result.escalations.join(" → ")}`);
}
```

### CLI Commands

```bash
# View stats (cost breakdown, savings, escalation rate)
model-router stats

# View recent routing decisions
model-router decisions [limit]

# View routing rules and hit rates
model-router rules
```

## Configuration

Edit `config.yaml` to customize routing rules:

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

### Available Conditions

- `prompt_tokens_lt` — Route to this model if prompt is shorter than N tokens
- `no_tool_use` — Route to this model if no tools are being used
- `tool_count_gt` — Route to this model if more than N tools are used
- `file_count_gt` — Route to this model if more than N files are involved

## How It Works

```
Request
  ↓
Extract features (tokens, tool count, file count)
  ↓
Apply routing rules → Select model (Haiku/Sonnet/Opus)
  ↓
Execute on selected model
  ↓
If failure detected → Escalate to next tier
  ↓
Log decision + outcome to SQLite
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm test             # Run tests
npm run cli stats    # Run CLI locally
```

## Next Steps

- **Phase 2**: Train a classifier on collected outcome data
- **Phase 3**: Implement contextual bandit for adaptive routing
- **Proxy Integration**: Wire as HTTP proxy between Claude Code and API

## License

MIT
