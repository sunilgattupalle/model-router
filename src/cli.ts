#!/usr/bin/env node
import { getStats, formatStats } from "./stats.js";
import { getDb } from "./db.js";
import { getConfig } from "./router.js";

const command = process.argv[2];

switch (command) {
  case "stats":
    showStats();
    break;
  case "decisions":
    showDecisions();
    break;
  case "rules":
    showRules();
    break;
  default:
    console.log(`
Usage: model-router <command>

Commands:
  stats      Show cost breakdown, escalation rate, savings
  decisions  Show recent routing decisions with outcomes
  rules      Show routing rules and their hit rates
`);
}

function showStats() {
  const stats = getStats();
  console.log(formatStats(stats));
}

function showDecisions() {
  const db = getDb();
  const limit = parseInt(process.argv[3] || "20");

  const rows = db.prepare(`
    SELECT
      d.id,
      datetime(d.timestamp / 1000, 'unixepoch', 'localtime') as time,
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

  console.log(`\n📝 Recent Decisions (last ${limit})\n`);
  console.log("Time                | Model  | Rule              | Tokens | Status     | Latency | Cost");
  console.log("─".repeat(95));

  for (const row of rows as any[]) {
    const escalated = row.escalated_from ? ` ↑${row.escalated_from}` : "";
    console.log(
      `${row.time} | ${(row.model + escalated).padEnd(6)} | ${row.rule.padEnd(17)} | ${String(row.tokens).padStart(6)} | ${(row.status || "pending").padEnd(10)} | ${String(row.latency_ms || "-").padStart(7)} | $${(row.cost_usd || 0).toFixed(4)}`
    );
  }
  console.log();
}

function showRules() {
  const cfg = getConfig();
  const db = getDb();

  console.log(`\n📋 Routing Rules\n`);

  for (const rule of cfg.rules) {
    const hitCount = db.prepare(
      "SELECT COUNT(*) as count FROM decisions WHERE rule_matched = ?"
    ).get(rule.name) as { count: number };

    console.log(`${rule.name}:`);
    console.log(`  → ${rule.model}`);
    if (rule.conditions) {
      console.log(`  conditions: ${JSON.stringify(rule.conditions)}`);
    }
    console.log(`  hits: ${hitCount.count}`);
    console.log();
  }
}
