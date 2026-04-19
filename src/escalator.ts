import { escalate, getConfig } from "./router.js";
import { logDecision, logOutcome, hashPrompt, type Decision } from "./logger.js";

export interface EscalationResult {
  finalModel: string;
  escalations: string[];
  decision: Decision;
}

export type ExecuteFn = (modelId: string) => Promise<{ success: boolean; tokensUsed: number; latencyMs: number }>;

export async function executeWithEscalation(
  prompt: string,
  initialModel: string,
  execute: ExecuteFn,
): Promise<EscalationResult> {
  const cfg = getConfig();
  const escalations: string[] = [];
  let currentModel = initialModel;
  const maxDepth = cfg.escalation.max_depth;

  for (let attempt = 0; attempt <= maxDepth; attempt++) {
    const modelConfig = cfg.models[currentModel];
    if (!modelConfig) break;

    const decision = logDecision({
      promptHash: hashPrompt(prompt),
      promptTokens: prompt.length / 4,
      modelSelected: currentModel,
      ruleMatched: attempt === 0 ? "initial" : "escalation",
      escalatedFrom: attempt > 0 ? escalations[escalations.length - 1] : null,
      confidence: attempt === 0 ? 0.8 : 0.6,
    });

    const result = await execute(modelConfig.id);

    const costUsd =
      (result.tokensUsed / 1000) * modelConfig.cost_per_1k_output;

    logOutcome({
      decisionId: decision.id,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
      status: result.success ? "success" : attempt < maxDepth ? "escalated" : "error",
      retries: attempt,
      costUsd,
    });

    if (result.success) {
      return { finalModel: currentModel, escalations, decision };
    }

    const nextModel = escalate(currentModel);
    if (!nextModel) break;

    escalations.push(currentModel);
    currentModel = nextModel;
  }

  return { finalModel: currentModel, escalations, decision: {} as Decision };
}
