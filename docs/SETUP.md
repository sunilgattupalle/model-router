# Setup Guide

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start the proxy**
   ```bash
   npm run proxy
   ```

   This starts a proxy server on `http://localhost:8080` that routes requests to the Anthropic API.

3. **Configure Claude Code to use the proxy**

   Set the `ANTHROPIC_BASE_URL` environment variable to point to the proxy:

   ```bash
   export ANTHROPIC_BASE_URL=http://localhost:8080
   ```

   Or add to your shell profile (`~/.zshrc` or `~/.bashrc`):
   ```bash
   echo 'export ANTHROPIC_BASE_URL=http://localhost:8080' >> ~/.zshrc
   source ~/.zshrc
   ```

4. **Use Claude Code normally**

   The proxy will:
   - Intercept all requests
   - Route to Haiku/Sonnet/Opus based on task complexity
   - Log all decisions and outcomes
   - Auto-escalate on failures

## Verify It's Working

```bash
# In another terminal, watch the router logs
npm run cli decisions

# Check stats
npm run cli stats
```

You should see routing decisions being logged as you use Claude Code.

## Configuration

### Adjust Routing Rules

Edit `config.yaml` to tune when each model is used:

```yaml
rules:
  - name: simple-queries
    conditions:
      prompt_tokens_lt: 500  # Increase to route more to Haiku
      no_tool_use: true
    model: haiku
    
  - name: multi-file-edits
    conditions:
      tool_count_gt: 3      # Adjust thresholds as needed
      file_count_gt: 2
    model: opus
```

### Change Proxy Port

```bash
npm run proxy 3000  # Use port 3000 instead
```

Then update `ANTHROPIC_BASE_URL=http://localhost:3000`

### Disable Routing (Temporary)

Just stop the proxy and unset the environment variable:

```bash
# Kill the proxy (Ctrl+C)
unset ANTHROPIC_BASE_URL
```

Claude Code will use the direct Anthropic API again.

## Troubleshooting

### "Connection refused"

Make sure the proxy is running:
```bash
npm run proxy
```

### "No decisions being logged"

Verify the proxy is being used:
```bash
echo $ANTHROPIC_BASE_URL
# Should show: http://localhost:8080
```

Check proxy logs for incoming requests.

### High escalation rate

If escalation rate is > 20%, your rules are too aggressive. Adjust thresholds in `config.yaml`:

- Increase `prompt_tokens_lt` to route fewer tasks to Haiku
- Decrease `tool_count_gt` / `file_count_gt` to route fewer to Opus

### Proxy errors

Check proxy logs for error details. Common issues:
- Invalid API key (proxy passes through to Anthropic)
- Network issues reaching api.anthropic.com
- Malformed requests

## Advanced: Use with Multiple Projects

You can run multiple proxies on different ports with different configs:

```bash
# Terminal 1 - aggressive routing for project A
cd project-a
npm run proxy 8080

# Terminal 2 - conservative routing for project B  
cd project-b
npm run proxy 8081
```

Then set `ANTHROPIC_BASE_URL` per project in `.env` files.

## Next Steps

After running for a few days:

1. Review stats: `npm run cli stats`
2. Tune rules based on escalation rate
3. Check decisions: `npm run cli decisions 100`
4. Adjust `config.yaml` and restart proxy
