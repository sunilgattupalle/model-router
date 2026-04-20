import { RoutingStrategy, type RoutingDecision, type PromptFeatures } from "./base.js";

export class RuleBasedStrategy extends RoutingStrategy {
  name = "rule-based";

  async route(features: PromptFeatures): Promise<RoutingDecision> {
    const { prompt, wordCount, hasQuestion, hasActionVerb, hasComplexSignal } = features;
    const lower = prompt.toLowerCase();

    // Complex tasks → Opus
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
        return { model: "opus", reasoning: `complex task signal: "${signal}"`, confidence: 0.85 };
      }
    }

    // Action tasks → Sonnet
    if (hasActionVerb || (wordCount > 30 && !hasQuestion)) {
      return { model: "sonnet", reasoning: "action task detected", confidence: 0.75 };
    }

    // Questions → Haiku
    if (hasQuestion || wordCount < 30) {
      return { model: "haiku", reasoning: "simple question or short prompt", confidence: 0.8 };
    }

    // Default → Sonnet
    return { model: "sonnet", reasoning: "standard task complexity", confidence: 0.5 };
  }
}
