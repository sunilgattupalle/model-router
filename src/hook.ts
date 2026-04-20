#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { logDecision, hashPrompt } from "./logger.js";
import { getDb } from "./db.js";

const SETTINGS_PATH = join(process.env.HOME || "~", ".claude", "settings.json");
const CONFIG_PATH = join(import.meta.dirname, "..", "config.yaml");

const DEFAULT_MODEL_MAP: Record<string, string> = {
  haiku: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  sonnet: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
  opus: "global.anthropic.claude-opus-4-6-v1",
};

function loadModelMap(): Record<string, string> {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      const config = parseYaml(raw);
      if (config?.models && typeof config.models === "object") {
        const map: Record<string, string> = {};
        for (const [tier, value] of Object.entries(config.models)) {
          const entry = value as { id?: string };
          if (entry?.id) {
            map[tier] = entry.id;
          }
        }
        // Only use config map if it has entries, otherwise fall back
        if (Object.keys(map).length > 0) {
          return map;
        }
      }
    }
  } catch {
    // Fall through to defaults
  }
  return DEFAULT_MODEL_MAP;
}

const MODEL_MAP = loadModelMap();

interface HookInput {
  session_id: string;
  prompt: string;
  hook_event_name: string;
}

interface AnalysisResult {
  model: string;
  reasoning: string;
  confidence: number;
}

const ESCALATION_ORDER = ["haiku", "sonnet", "opus"];

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
    const since = Date.now() - 30 * 60 * 1000; // last 30 minutes
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

function maybeEscalate(model: string, reasoning: string): AnalysisResult {
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
  return { model, reasoning, confidence: model === "opus" ? 0.85 : model === "sonnet" ? 0.75 : 0.8 };
}

function analyzePrompt(prompt: string): AnalysisResult {
  const lower = prompt.toLowerCase();
  const wordCount = prompt.split(/\s+/).length;

  // Complex tasks -> Opus
  const opusSignals = [
    "refactor",
    "architect",
    "design",
    "security review",
    "debug.*across",
    "performance",
    "migrate",
    "\\bplan\\b",
    "implement.*system",
    "build.*from scratch",
    "complex",
    "analyze codebase",
    "code review",
  ];
  for (const signal of opusSignals) {
    if (new RegExp(signal).test(lower)) {
      return maybeEscalate("opus", `complex task signal: "${signal}"`);
    }
  }

  // Action tasks -> Sonnet
  const sonnetSignals = [
    "add", "update", "fix", "create", "implement", "build",
    "change", "modify", "write", "remove", "delete", "move",
    "endpoint", "function", "component", "test", "deploy",
    "configure", "setup", "install",
  ];
  for (const signal of sonnetSignals) {
    if (lower.includes(signal)) {
      return maybeEscalate("sonnet", `action task: "${signal}"`);
    }
  }

  // Questions -> Haiku
  const questionSignals = [
    "what", "how", "why", "where", "when", "which",
    "is", "are", "can", "does", "do",
    "explain", "show", "list", "describe",
  ];
  for (const signal of questionSignals) {
    if (new RegExp(`\\b${signal}\\b`).test(lower)) {
      return maybeEscalate("haiku", `question signal: "${signal}"`);
    }
  }

  // Short prompts with no action signals -> Haiku
  if (wordCount < 30) {
    return maybeEscalate("haiku", "short prompt, no action signals");
  }

  // Default -> Sonnet
  return maybeEscalate("sonnet", "standard task complexity");
}

function setModel(model: string): void {
  const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
  const modelId = MODEL_MAP[model] || model;

  if (settings.model === modelId) return;

  settings.model = modelId;
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
}

function main() {
  let input = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => {
    try {
      const hookData: HookInput = JSON.parse(input);
      const { model, reasoning, confidence } = analyzePrompt(hookData.prompt);

      setModel(model);

      // Log decision to SQLite
      try {
        logDecision({
          promptHash: hashPrompt(hookData.prompt),
          promptTokens: Math.ceil(hookData.prompt.length / 4),
          modelSelected: model,
          ruleMatched: reasoning,
          escalatedFrom: null,
          confidence,
        });
      } catch {
        // Don't block on logging errors
      }

      // Output context that Claude will see
      const output = JSON.stringify({
        continue: true,
        suppressOutput: false,
        additionalContext: `[Model Router] Selected: ${model} — ${reasoning}`,
      });
      process.stdout.write(output);
    } catch (err) {
      // Don't block on errors
      process.stdout.write(JSON.stringify({ continue: true }));
    }
  });
}

main();
