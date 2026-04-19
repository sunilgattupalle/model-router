import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { getDb } from "./db.js";

export interface Decision {
  id: string;
  timestamp: number;
  promptHash: string;
  promptTokens: number;
  modelSelected: string;
  ruleMatched: string;
  escalatedFrom: string | null;
  confidence: number;
}

export interface Outcome {
  decisionId: string;
  tokensUsed: number;
  latencyMs: number;
  status: "success" | "error" | "escalated";
  retries: number;
  costUsd: number;
}

export function logDecision(params: Omit<Decision, "id" | "timestamp">): Decision {
  const decision: Decision = {
    id: randomUUID(),
    timestamp: Date.now(),
    ...params,
  };

  const db = getDb();
  db.prepare(`
    INSERT INTO decisions (id, timestamp, prompt_hash, prompt_tokens, model_selected, rule_matched, escalated_from, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    decision.id,
    decision.timestamp,
    decision.promptHash,
    decision.promptTokens,
    decision.modelSelected,
    decision.ruleMatched,
    decision.escalatedFrom,
    decision.confidence,
  );

  return decision;
}

export function logOutcome(outcome: Outcome): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO outcomes (decision_id, tokens_used, latency_ms, status, retries, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    outcome.decisionId,
    outcome.tokensUsed,
    outcome.latencyMs,
    outcome.status,
    outcome.retries,
    outcome.costUsd,
  );
}

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}
