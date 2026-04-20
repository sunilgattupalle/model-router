#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { getDb } from "./db.js";
import { logOutcome } from "./logger.js";

interface StopHookInput {
  stop_reason: "end_turn" | "tool_use" | "max_tokens";
  error?: string;
  error_type?: string;
  session_id: string;
  transcript_path: string;
  hook_event_name: string;
}

interface TranscriptEntry {
  type: string;
  message?: {
    role: string;
    content: unknown;
    usage?: { input_tokens?: number; output_tokens?: number };
    model?: string;
  };
  tool_use_id?: string;
  tool_result?: { success?: boolean; error?: string };
}

function getLastDecision(): { id: string; model_selected: string; timestamp: number } | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT id, model_selected, timestamp FROM decisions ORDER BY timestamp DESC LIMIT 1"
  ).get() as { id: string; model_selected: string; timestamp: number } | undefined;
  return row || null;
}

function analyzeTranscript(transcriptPath: string): {
  toolCalls: number;
  toolFailures: number;
  responseLength: number;
  estimatedOutputTokens: number;
} {
  const result = { toolCalls: 0, toolFailures: 0, responseLength: 0, estimatedOutputTokens: 0 };

  if (!existsSync(transcriptPath)) return result;

  try {
    const raw = readFileSync(transcriptPath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const entry: TranscriptEntry = JSON.parse(line);

        if (entry.type === "tool_result" || entry.tool_result) {
          result.toolCalls++;
          if (entry.tool_result?.success === false || entry.tool_result?.error) {
            result.toolFailures++;
          }
        }

        if (entry.message?.role === "assistant") {
          const content = entry.message.content;
          if (typeof content === "string") {
            result.responseLength += content.length;
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (typeof block === "string") result.responseLength += block.length;
              else if (block?.text) result.responseLength += block.text.length;
            }
          }

          if (entry.message.usage?.output_tokens) {
            result.estimatedOutputTokens += entry.message.usage.output_tokens;
          }
        }
      } catch {
        // skip unparseable lines
      }
    }

    if (result.estimatedOutputTokens === 0) {
      result.estimatedOutputTokens = Math.ceil(result.responseLength / 4);
    }
  } catch {
    // transcript read failed
  }

  return result;
}

function scoreOutcome(
  stopReason: string,
  error: string | undefined,
  transcript: ReturnType<typeof analyzeTranscript>
): "success" | "error" | "partial" {
  if (error) return "error";
  if (stopReason === "max_tokens") return "partial";
  if (transcript.toolFailures > 0 && transcript.toolFailures >= transcript.toolCalls * 0.5) return "error";
  return "success";
}

function recordFailurePattern(model: string, status: string): void {
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

  db.prepare(
    "INSERT INTO model_performance (timestamp, model, status) VALUES (?, ?, ?)"
  ).run(Date.now(), model, status);
}

function main() {
  let input = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => {
    try {
      const hookData: StopHookInput = JSON.parse(input);
      const lastDecision = getLastDecision();

      if (!lastDecision) {
        process.stdout.write(JSON.stringify({ continue: true }));
        return;
      }

      // Only process recent decisions (within last 5 minutes)
      if (Date.now() - lastDecision.timestamp > 5 * 60 * 1000) {
        process.stdout.write(JSON.stringify({ continue: true }));
        return;
      }

      const transcript = analyzeTranscript(hookData.transcript_path);
      const status = scoreOutcome(hookData.stop_reason, hookData.error, transcript);

      // Log outcome
      const config = getModelConfig();
      const costPerToken = config[lastDecision.model_selected]?.cost_per_1k_output || 0.015;
      const costUsd = (transcript.estimatedOutputTokens / 1000) * costPerToken;

      logOutcome({
        decisionId: lastDecision.id,
        tokensUsed: transcript.estimatedOutputTokens,
        latencyMs: Date.now() - lastDecision.timestamp,
        status: status === "partial" ? "error" : status,
        retries: 0,
        costUsd,
      });

      // Track model performance for adaptive routing
      recordFailurePattern(lastDecision.model_selected, status);

      process.stdout.write(JSON.stringify({ continue: true }));
    } catch {
      process.stdout.write(JSON.stringify({ continue: true }));
    }
  });
}

function getModelConfig(): Record<string, { cost_per_1k_output: number }> {
  try {
    const configPath = join(import.meta.dirname, "..", "config.yaml");
    const raw = readFileSync(configPath, "utf-8");
    const config = parseYaml(raw);
    return config.models || {};
  } catch {
    return {
      haiku: { cost_per_1k_output: 0.005 },
      sonnet: { cost_per_1k_output: 0.015 },
      opus: { cost_per_1k_output: 0.075 },
    };
  }
}

main();
