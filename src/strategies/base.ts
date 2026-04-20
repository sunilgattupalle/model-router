export interface RoutingDecision {
  model: "haiku" | "sonnet" | "opus";
  reasoning: string;
  confidence: number;
}

export interface PromptFeatures {
  prompt: string;
  wordCount: number;
  hasQuestion: boolean;
  hasActionVerb: boolean;
  hasComplexSignal: boolean;
  estimatedTokens: number;
}

export abstract class RoutingStrategy {
  abstract name: string;
  abstract route(features: PromptFeatures): Promise<RoutingDecision>;
}

export function extractFeatures(prompt: string): PromptFeatures {
  const lower = prompt.toLowerCase();
  const wordCount = prompt.split(/\s+/).length;

  const questionWords = ["what", "how", "why", "where", "when", "which", "is", "are", "can", "does", "do"];
  const hasQuestion = questionWords.some((q) => new RegExp(`\\b${q}\\b`).test(lower));

  const actionVerbs = ["add", "update", "fix", "create", "implement", "build", "change", "modify", "write"];
  const hasActionVerb = actionVerbs.some((v) => lower.includes(v));

  const complexSignals = ["refactor", "architect", "design", "security", "performance", "migrate", "complex"];
  const hasComplexSignal = complexSignals.some((s) => lower.includes(s));

  return {
    prompt,
    wordCount,
    hasQuestion,
    hasActionVerb,
    hasComplexSignal,
    estimatedTokens: Math.ceil(prompt.length / 4),
  };
}
