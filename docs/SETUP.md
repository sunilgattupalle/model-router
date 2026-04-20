# Setup Guide

## Hook-Based Setup (Primary)

### 1. Install and build

```bash
cd model-router
npm install
npm run build
```

### 2. Configure the hook

Add to your project's `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "node /absolute/path/to/model-router/dist/hook.js"
      }
    ]
  }
}
```

Replace `/absolute/path/to/model-router` with the actual path.

### 3. Start using Claude Code

Open a Claude Code session in the project. Every prompt will be analyzed by the hook, and the model will switch automatically. You will see a `[Model Router]` message indicating which model was selected.

### 4. Monitor with the dashboard

```bash
npm run dashboard
# Open http://localhost:3000
```

Or use the CLI:

```bash
npm run cli stats
npm run cli decisions
```

### Disable routing

Remove the hook entry from `.claude/settings.json`, or comment it out. Claude Code will use its default model.

### Adjust routing

Edit `config.yaml` to change routing rules. The hook uses prompt analysis (keyword matching) to classify prompts. To change the classification logic, edit `src/hook.ts` and rebuild.

## Proxy-Based Setup (Legacy/Alternative)

For environments where hooks are not available.

### 1. Start the proxy

```bash
npm run proxy
```

Starts on `http://localhost:8080`.

### 2. Point Claude Code at the proxy

```bash
export ANTHROPIC_BASE_URL=http://localhost:8080
```

Add to `~/.zshrc` or `~/.bashrc` to persist.

### 3. Use Claude Code normally

The proxy intercepts requests, applies routing rules, and forwards to the Anthropic API.

### Disable proxy routing

Stop the proxy (Ctrl+C) and unset the env var:

```bash
unset ANTHROPIC_BASE_URL
```

## Troubleshooting

### Hook not running

- Verify `.claude/settings.json` has the hook configured
- Check the path to `dist/hook.js` is absolute and correct
- Run `npm run build` to ensure the JS is compiled
- Test manually: `echo '{"session_id":"test","prompt":"hello","hook_event_name":"UserPromptSubmit"}' | node dist/hook.js`

### No decisions in dashboard

- The hook logs decisions to `data/router.db`
- Make sure the hook is running (check for `[Model Router]` messages in Claude Code)
- Verify the database exists: `ls data/router.db`

### High cost (not routing to Haiku)

- Check `npm run cli decisions` to see which models are being selected
- Most coding prompts contain action keywords and route to Sonnet
- Haiku is reserved for short, simple questions
