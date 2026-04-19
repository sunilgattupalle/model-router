import http from "http";
import httpProxy from "http-proxy";
import { route, type RequestFeatures } from "./router.js";
import { logDecision, logOutcome, hashPrompt } from "./logger.js";
import { getConfig } from "./router.js";

const ANTHROPIC_API = "https://api.anthropic.com";
const PORT = 8080;

interface AnthropicRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  tools?: unknown[];
}

export function startProxy(port = PORT) {
  const proxy = httpProxy.createProxyServer({});

  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || !req.url?.includes("/messages")) {
      // Pass through non-message requests
      proxy.web(req, res, { target: ANTHROPIC_API });
      return;
    }

    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const payload: AnthropicRequest = JSON.parse(body);

        // Extract features
        const features = extractFeatures(payload);

        // Route
        const decision = route(features);

        // Log decision
        const prompt = payload.messages.map(m => m.content).join("\n");
        const logged = logDecision({
          promptHash: hashPrompt(prompt),
          promptTokens: features.promptTokens,
          modelSelected: decision.model,
          ruleMatched: decision.rule,
          escalatedFrom: null,
          confidence: decision.confidence,
        });

        console.log(`[Router] ${decision.model} (${decision.rule}) for ${features.promptTokens} tokens`);

        // Modify request to use selected model
        payload.model = decision.modelId;

        const startTime = Date.now();

        // Forward modified request
        const proxyReq = http.request(
          {
            hostname: "api.anthropic.com",
            path: req.url,
            method: req.method,
            headers: {
              ...req.headers,
              "content-length": Buffer.byteLength(JSON.stringify(payload)),
            },
          },
          (proxyRes) => {
            let responseBody = "";
            proxyRes.on("data", chunk => responseBody += chunk);
            proxyRes.on("end", () => {
              const latency = Date.now() - startTime;

              // Log outcome
              try {
                const response = JSON.parse(responseBody);
                const tokensUsed = response.usage?.output_tokens || 0;
                const cfg = getConfig();
                const modelCfg = cfg.models[decision.model];
                const costUsd = (tokensUsed / 1000) * modelCfg.cost_per_1k_output;

                logOutcome({
                  decisionId: logged.id,
                  tokensUsed,
                  latencyMs: latency,
                  status: proxyRes.statusCode === 200 ? "success" : "error",
                  retries: 0,
                  costUsd,
                });

                console.log(`[Router] ✓ ${tokensUsed} tokens, ${latency}ms, $${costUsd.toFixed(4)}`);
              } catch (e) {
                console.error("[Router] Failed to log outcome:", e);
              }

              // Forward response
              res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
              res.end(responseBody);
            });
          }
        );

        proxyReq.on("error", (err) => {
          console.error("[Router] Proxy error:", err);
          res.writeHead(500);
          res.end(JSON.stringify({ error: "Proxy error" }));
        });

        proxyReq.write(JSON.stringify(payload));
        proxyReq.end();

      } catch (err) {
        console.error("[Router] Request processing error:", err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Invalid request" }));
      }
    });
  });

  server.listen(port, () => {
    console.log(`\n🚀 Model Router Proxy running on http://localhost:${port}`);
    console.log(`   Point your Claude Code API calls to http://localhost:${port}\n`);
  });

  return server;
}

function extractFeatures(payload: AnthropicRequest): RequestFeatures {
  const messages = payload.messages || [];
  const promptText = messages.map(m => m.content).join("\n");
  const promptTokens = Math.ceil(promptText.length / 4); // rough estimate

  const tools = payload.tools || [];
  const toolCount = tools.length;

  // Count file references (heuristic: look for file paths)
  const fileMatches = promptText.match(/\b[\w\-./]+\.(ts|js|py|go|java|tsx|jsx)\b/g);
  const fileCount = fileMatches ? new Set(fileMatches).size : 0;

  return {
    promptTokens,
    toolCount,
    fileCount,
    hasToolUse: toolCount > 0,
  };
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.argv[2] || String(PORT));
  startProxy(port);
}
