#!/usr/bin/env node
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getStats } from "./stats.js";
import { getDb } from "./db.js";
import { getConfig } from "./router.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || process.argv[2] || "3000");

const SETTINGS_PATH = path.join(process.env.HOME || "~", ".claude", "settings.json");

function modelIdToName(modelId: string): string {
  if (modelId.includes("haiku")) return "haiku";
  if (modelId.includes("sonnet")) return "sonnet";
  if (modelId.includes("opus")) return "opus";
  return modelId || "unknown";
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath);
  const types: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".json": "application/json",
  };
  return types[ext] || "text/plain";
}

function jsonError(res: http.ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

const server = http.createServer((req, res) => {
  // CORS headers for development
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // API endpoints
  if (req.url === "/api/stats") {
    try {
      const stats = getStats();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(stats));
    } catch (err) {
      console.error("Error in /api/stats:", err);
      jsonError(res, 500, `Failed to get stats: ${(err as Error).message}`);
    }
    return;
  }

  if (req.url?.startsWith("/api/decisions")) {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const limit = parseInt(url.searchParams.get("limit") || "50");

      const db = getDb();
      const rows = db.prepare(`
        SELECT
          d.id,
          d.timestamp,
          d.model_selected as model,
          d.rule_matched as rule,
          d.prompt_tokens as tokens,
          d.escalated_from,
          o.status,
          o.latency_ms,
          o.cost_usd
        FROM decisions d
        LEFT JOIN outcomes o ON d.id = o.decision_id
        ORDER BY d.timestamp DESC
        LIMIT ?
      `).all(limit);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(rows));
    } catch (err) {
      console.error("Error in /api/decisions:", err);
      jsonError(res, 500, `Failed to get decisions: ${(err as Error).message}`);
    }
    return;
  }

  if (req.url === "/api/rules") {
    try {
      const cfg = getConfig();
      const db = getDb();

      const rules = cfg.rules.map((rule) => {
        const hitCount = db.prepare(
          "SELECT COUNT(*) as count FROM decisions WHERE rule_matched = ?"
        ).get(rule.name) as { count: number };

        return {
          name: rule.name,
          model: rule.model,
          conditions: rule.conditions,
          hits: hitCount.count,
        };
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(rules));
    } catch (err) {
      console.error("Error in /api/rules:", err);
      jsonError(res, 500, `Failed to get rules: ${(err as Error).message}`);
    }
    return;
  }

  if (req.url === "/api/current-model") {
    try {
      const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
      const settings = JSON.parse(raw);
      const modelId = settings.model || "";
      const modelName = modelIdToName(modelId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ modelId, modelName }));
    } catch (err) {
      console.error("Error in /api/current-model:", err);
      jsonError(res, 500, `Failed to read current model: ${(err as Error).message}`);
    }
    return;
  }

  // Serve static files
  let filePath = req.url === "/" ? "/index.html" : req.url || "/index.html";
  filePath = path.join(__dirname, "../public", filePath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404);
        res.end("404 Not Found");
      } else {
        res.writeHead(500);
        res.end("Server Error");
      }
    } else {
      res.writeHead(200, { "Content-Type": getContentType(filePath) });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`📊 Model Router Dashboard running at http://localhost:${PORT}`);
});
