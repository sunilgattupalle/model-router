import { RoutingStrategy, type RoutingDecision, type PromptFeatures } from "./base.js";
import { RuleBasedStrategy } from "./rule-based.js";
import { MLClassifierStrategy } from "./ml-classifier.js";

export class HybridStrategy extends RoutingStrategy {
  name = "hybrid";
  private ruleBased: RuleBasedStrategy;
  private mlClassifier: MLClassifierStrategy;

  constructor() {
    super();
    this.ruleBased = new RuleBasedStrategy();
    this.mlClassifier = new MLClassifierStrategy();
  }

  async route(features: PromptFeatures): Promise<RoutingDecision> {
    // Get predictions from both strategies
    const [ruleDecision, mlDecision] = await Promise.all([
      this.ruleBased.route(features),
      this.mlClassifier.route(features),
    ]);

    // If both agree, return with high confidence
    if (ruleDecision.model === mlDecision.model) {
      return {
        model: ruleDecision.model,
        reasoning: `hybrid: both agree on ${ruleDecision.model}`,
        confidence: Math.max(ruleDecision.confidence, mlDecision.confidence),
      };
    }

    // If they disagree, use the one with higher confidence
    if (mlDecision.confidence > ruleDecision.confidence) {
      return {
        model: mlDecision.model,
        reasoning: `hybrid: ml wins (${mlDecision.confidence.toFixed(2)} vs ${ruleDecision.confidence.toFixed(2)})`,
        confidence: mlDecision.confidence,
      };
    } else {
      return {
        model: ruleDecision.model,
        reasoning: `hybrid: rule wins (${ruleDecision.confidence.toFixed(2)} vs ${mlDecision.confidence.toFixed(2)})`,
        confidence: ruleDecision.confidence,
      };
    }
  }
}
