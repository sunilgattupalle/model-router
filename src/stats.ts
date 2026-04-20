import { getDb } from "./db.js";

export interface Stats {
  totalRequests: number;
  byModel: Record<string, { count: number; totalCost: number; avgLatency: number }>;
  escalationRate: number;
  totalCost: number;
  avgLatency: number;
  estimatedSavings: number;
}

export function getStats(since?: number): Stats {
  const db = getDb();
  const sinceTs = since ?? Date.now() - 7 * 24 * 60 * 60 * 1000;

  const total = db.prepare(
    "SELECT COUNT(*) as count FROM decisions WHERE timestamp > ?",
  ).get(sinceTs) as { count: number };

  const byModel = db.prepare(`
    SELECT d.model_selected as model, COUNT(*) as count,
           COALESCE(SUM(o.cost_usd), 0) as total_cost,
           COALESCE(AVG(o.latency_ms), 0) as avg_latency
    FROM decisions d
    LEFT JOIN outcomes o ON d.id = o.decision_id
    WHERE d.timestamp > ?
    GROUP BY d.model_selected
  `).all(sinceTs) as Array<{ model: string; count: number; total_cost: number; avg_latency: number }>;

  const escalated = db.prepare(
    "SELECT COUNT(*) as count FROM decisions WHERE escalated_from IS NOT NULL AND timestamp > ?",
  ).get(sinceTs) as { count: number };

  const totalCost = byModel.reduce((sum, m) => sum + m.total_cost, 0);

  // Estimate savings vs all-opus baseline
  const opusCfg = { cost_per_1k_output: 0.075 };
  const totalTokens = db.prepare(
    "SELECT COALESCE(SUM(o.tokens_used), 0) as tokens FROM outcomes o JOIN decisions d ON d.id = o.decision_id WHERE d.timestamp > ?",
  ).get(sinceTs) as { tokens: number };
  const opusBaseline = (totalTokens.tokens / 1000) * opusCfg.cost_per_1k_output;

  const modelStats: Record<string, { count: number; totalCost: number; avgLatency: number }> = {};
  for (const m of byModel) {
    modelStats[m.model] = { count: m.count, totalCost: m.total_cost, avgLatency: m.avg_latency };
  }

  const avgLatency = byModel.length > 0
    ? byModel.reduce((sum, m) => sum + m.avg_latency * m.count, 0) / byModel.reduce((sum, m) => sum + m.count, 0)
    : 0;

  return {
    totalRequests: total.count,
    byModel: modelStats,
    escalationRate: total.count > 0 ? escalated.count / total.count : 0,
    totalCost,
    avgLatency,
    estimatedSavings: opusBaseline - totalCost,
  };
}

export function formatStats(stats: Stats): string {
  const lines = [
    `\n📊 Model Router Stats (last 7 days)`,
    `───────────────────────────────────`,
    `Total requests: ${stats.totalRequests}`,
    `Total cost: $${stats.totalCost.toFixed(4)}`,
    `Estimated savings vs Opus-only: $${stats.estimatedSavings.toFixed(4)}`,
    `Escalation rate: ${(stats.escalationRate * 100).toFixed(1)}%`,
    ``,
    `By model:`,
  ];

  for (const [model, data] of Object.entries(stats.byModel)) {
    lines.push(`  ${model}: ${data.count} requests, $${data.totalCost.toFixed(4)}, avg ${data.avgLatency.toFixed(0)}ms`);
  }

  return lines.join("\n");
}
