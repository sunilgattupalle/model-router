# Model Router

Intelligent model routing for Claude Code via a `UserPromptSubmit` hook. Automatically selects between Haiku, Sonnet, and Opus based on prompt complexity. Reduces costs while maintaining quality.

## Features

- **Hook-based routing** -- Analyzes each prompt and sets the optimal model before execution
- **Automatic model switching** -- Writes to `~/.claude/settings.json`, which Claude Code hot-reloads
- **Full observability** -- SQLite logging of every routing decision
- **Web dashboard** -- Real-time stats at `http://localhost:3000`
- **CLI tools** -- Quick stats from the terminal
- **Local-first** -- No external infrastructure required

## Quick Start

1. **Install and build**
   ```bash
   npm install && npm run build
   ```

2. **Configure the hook** in `.claude/settings.json` (project-level):
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

3. **Start a Claude Code session** in the project. The hook runs on every prompt and selects the model automatically.

4. **View analytics**
   ```bash
   npm run dashboard    # Web dashboard on http://localhost:3000
   npm run cli stats    # Cost breakdown, model distribution
   npm run cli decisions  # Recent routing decisions
   npm run cli rules    # Rule hit rates
   ```

## How Routing Works

The hook analyzes each prompt and selects a model tier:

| Tier | When | Examples |
|------|------|----------|
| **Haiku** | Short, simple questions (< 30 words, no action keywords) | "what does this function do?", "explain this error" |
| **Sonnet** | Standard coding tasks | "add a test for X", "fix the bug in Y", "create a component" |
| **Opus** | Complex multi-step work | "refactor the auth system", "architect a new module", "security review" |

The selected model is written to `~/.claude/settings.json`. Claude Code hot-reloads this file, so the next response uses the chosen model.

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

## CLI Commands

```bash
npm run cli stats      # Cost breakdown, savings, escalation rate
npm run cli decisions  # Recent routing decisions
npm run cli rules      # Routing rules and hit rates
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm test             # Run tests
npm run dashboard    # Start web dashboard
```

## Alternative: Proxy Mode (Legacy)

The project also includes a proxy-based approach (`npm run proxy`) that intercepts HTTP requests on `localhost:8080`. This requires setting `ANTHROPIC_BASE_URL` and is maintained as an alternative for environments where hooks are not available. See [docs/SETUP.md](docs/SETUP.md) for proxy setup instructions.

## License

MIT
