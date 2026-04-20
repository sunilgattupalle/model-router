#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { logDecision, hashPrompt } from "./logger.js";
import { getDb } from "./db.js";
import {
  type RoutingStrategy,
  extractFeatures,
  RuleBasedStrategy,
  MLClassifierStrategy,
  LLMRoutingStrategy,
  HybridStrategy,
} from "./strategies/index.js";

const SETTINGS_PATH = join(process.env.HOME || "~", ".claude", "settings.json");
const CONFIG_PATH = join(import.meta.dirname, "..", "config.yaml");

const DEFAULT_MODEL_MAP: Record<string, string> = {
  haiku: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  sonnet: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
  opus: "global.anthropic.claude-opus-4-6-v1",
};

const ESCALATION_ORDER = ["haiku", "sonnet", "opus"];

interface HookInput {
  session_id: string;
  prompt: string;
  hook_event_name: string;
}

interface Config {
  models?: Record<string, { id?: string }>;
  routing?: {
    strategy?: string;
    llm_api_key?: string;
    llm_endpoint?: string;
  };
}

function loadConfig(): Config {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      return parseYaml(raw) as Config;
    }
  } catch {
    // Fall through
  }
  return {};
}

function loadModelMap(): Record<string, string> {
  const config = loadConfig();
  if (config.models && typeof config.models === "object") {
    const map: Record<string, string> = {};
    for (const [tier, value] of Object.entries(config.models)) {
      if (value?.id) {
        map[tier] = value.id;
      }
    }
    if (Object.keys(map).length > 0) return map;
  }
  return DEFAULT_MODEL_MAP;
}

function loadStrategy(): RoutingStrategy {
  const config = loadConfig();
  const strategyName = config.routing?.strategy || "rule-based";

  switch (strategyName) {
    case "ml-classifier":
      return new MLClassifierStrategy();
    case "llm-routing":
      return new LLMRoutingStrategy(config.routing?.llm_api_key, config.routing?.llm_endpoint);
    case "hybrid":
      return new HybridStrategy();
    case "rule-based":
    default:
      return new RuleBasedStrategy();
  }
}

function getRecentFailureRate(model: string): number {
  try {
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS model_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL,
        prompt_category TEXT
      )
    `);
    const since = Date.now() - 30 * 60 * 1000;
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) as failures
      FROM model_performance
      WHERE model = ? AND timestamp > ?
    `).get(model, since) as { total: number; failures: number };
    if (stats.total < 2) return 0;
    return stats.failures / stats.total;
  } catch {
    return 0;
  }
}

function maybeEscalate(model: string, reasoning: string, confidence: number) {
  const failureRate = getRecentFailureRate(model);
  if (failureRate > 0.4) {
    const idx = ESCALATION_ORDER.indexOf(model);
    if (idx >= 0 && idx < ESCALATION_ORDER.length - 1) {
      const escalated = ESCALATION_ORDER[idx + 1];
      return {
        model: escalated,
        reasoning: `${reasoning} (escalated from ${model}: ${Math.round(failureRate * 100)}% recent failure rate)`,
        confidence: 0.7,
      };
    }
  }
  return { model, reasoning, confidence };
}

function setModel(model: string): void {
  const MODEL_MAP = loadModelMap();
  const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
  const modelId = MODEL_MAP[model] || model;

  if (settings.model === modelId) return;

  settings.model = modelId;
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
}

async function main() {
  let input = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", async () => {
    try {
      const hookData: HookInput = JSON.parse(input);
      const features = extractFeatures(hookData.prompt);

      // Load and execute strategy
      const strategy = loadStrategy();
      const decision = await strategy.route(features);

      // Apply adaptive escalation
      const finalDecision = maybeEscalate(decision.model, decision.reasoning, decision.confidence);

      setModel(finalDecision.model);

      // Log decision to SQLite
      try {
        logDecision({
          promptHash: hashPrompt(hookData.prompt),
          promptTokens: features.estimatedTokens,
          modelSelected: finalDecision.model,
          ruleMatched: finalDecision.reasoning,
          escalatedFrom: null,
          confidence: finalDecision.confidence,
        });
      } catch {
        // Don't block on logging errors
      }

      // Output context that Claude will see
      const output = JSON.stringify({
        continue: true,
        suppressOutput: false,
        additionalContext: `[Model Router] ${strategy.name}: ${finalDecision.model} — ${finalDecision.reasoning}`,
      });
      process.stdout.write(output);
    } catch (err) {
      // Don't block on errors
      process.stdout.write(JSON.stringify({ continue: true }));
    }
  });
}

main();
