import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export interface RoutingRule {
  name: string;
  conditions: Record<string, unknown>;
  model: string;
}

export interface Config {
  models: Record<string, { id: string; cost_per_1k_input: number; cost_per_1k_output: number }>;
  rules: RoutingRule[];
  escalation: { enabled: boolean; max_depth: number; triggers: string[] };
}

export interface RequestFeatures {
  promptTokens: number;
  toolCount: number;
  fileCount: number;
  hasToolUse: boolean;
}

export interface RoutingDecision {
  model: string;
  modelId: string;
  rule: string;
  confidence: number;
}

const ESCALATION_ORDER = ["haiku", "sonnet", "opus"];

let config: Config | null = null;

export function loadConfig(path?: string): Config {
  const configPath = path ?? join(import.meta.dirname, "..", "config.yaml");
  const raw = readFileSync(configPath, "utf-8");
  config = parse(raw) as Config;
  return config;
}

export function getConfig(): Config {
  if (!config) return loadConfig();
  return config;
}

export function route(features: RequestFeatures): RoutingDecision {
  const cfg = getConfig();

  for (const rule of cfg.rules) {
    if (matchesRule(rule, features)) {
      return {
        model: rule.model,
        modelId: cfg.models[rule.model].id,
        rule: rule.name,
        confidence: rule.name === "default" ? 0.5 : 0.8,
      };
    }
  }

  return { model: "sonnet", modelId: cfg.models.sonnet.id, rule: "fallback", confidence: 0.5 };
}

export function escalate(currentModel: string): string | null {
  const idx = ESCALATION_ORDER.indexOf(currentModel);
  if (idx === -1 || idx >= ESCALATION_ORDER.length - 1) return null;
  return ESCALATION_ORDER[idx + 1];
}

function matchesRule(rule: RoutingRule, features: RequestFeatures): boolean {
  const c = rule.conditions;
  if (!c) return true;

  if (c.prompt_tokens_lt && features.promptTokens >= (c.prompt_tokens_lt as number)) return false;
  if (c.no_tool_use && features.hasToolUse) return false;
  if (c.tool_count_gt && features.toolCount <= (c.tool_count_gt as number)) return false;
  if (c.file_count_gt && features.fileCount <= (c.file_count_gt as number)) return false;

  return true;
}
