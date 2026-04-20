import { RoutingStrategy, type RoutingDecision, type PromptFeatures } from "./base.js";
import { getDb } from "../db.js";

interface TrainingExample {
  features: number[];
  label: 0 | 1 | 2; // 0=haiku, 1=sonnet, 2=opus
}

export class MLClassifierStrategy extends RoutingStrategy {
  name = "ml-classifier";
  private weights: number[][] | null = null;
  private readonly modelMap = ["haiku", "sonnet", "opus"] as const;

  async route(features: PromptFeatures): Promise<RoutingDecision> {
    if (!this.weights) {
      this.train();
    }

    if (!this.weights) {
      // Fall back to rule-based if no training data
      return {
        model: features.hasComplexSignal ? "opus" : features.hasActionVerb ? "sonnet" : "haiku",
        reasoning: "ml classifier (untrained, using fallback)",
        confidence: 0.5,
      };
    }

    const featureVector = this.featurize(features);
    const scores = this.predict(featureVector);
    const maxIdx = scores.indexOf(Math.max(...scores));
    const model = this.modelMap[maxIdx];

    return {
      model,
      reasoning: `ml classifier (score: ${scores[maxIdx].toFixed(2)})`,
      confidence: scores[maxIdx],
    };
  }

  private featurize(features: PromptFeatures): number[] {
    return [
      features.wordCount / 100, // normalized
      features.hasQuestion ? 1 : 0,
      features.hasActionVerb ? 1 : 0,
      features.hasComplexSignal ? 1 : 0,
      features.estimatedTokens / 1000, // normalized
    ];
  }

  private predict(features: number[]): number[] {
    if (!this.weights) return [0.33, 0.33, 0.34];

    const scores = this.weights.map((w) => {
      let score = w[0]; // bias
      for (let i = 0; i < features.length; i++) {
        score += w[i + 1] * features[i];
      }
      return 1 / (1 + Math.exp(-score)); // sigmoid
    });

    // Softmax normalization
    const expScores = scores.map(Math.exp);
    const sumExp = expScores.reduce((a, b) => a + b, 0);
    return expScores.map((s) => s / sumExp);
  }

  private train(): void {
    try {
      const db = getDb();
      const rows = db.prepare(`
        SELECT d.prompt_tokens, d.rule_matched, d.model_selected, o.status
        FROM decisions d
        JOIN outcomes o ON d.id = o.decision_id
        WHERE o.status = 'success'
        ORDER BY d.timestamp DESC
        LIMIT 100
      `).all() as Array<{
        prompt_tokens: number;
        rule_matched: string;
        model_selected: string;
        status: string;
      }>;

      if (rows.length < 10) return; // Not enough data

      const examples: TrainingExample[] = rows.map((r) => {
        const hasQuestion = r.rule_matched.includes("question");
        const hasAction = r.rule_matched.includes("action");
        const hasComplex = r.rule_matched.includes("complex");
        const label = r.model_selected === "opus" ? 2 : r.model_selected === "sonnet" ? 1 : 0;

        return {
          features: [
            r.prompt_tokens / 100,
            hasQuestion ? 1 : 0,
            hasAction ? 1 : 0,
            hasComplex ? 1 : 0,
            r.prompt_tokens / 1000,
          ],
          label: label as 0 | 1 | 2,
        };
      });

      // Simple logistic regression (gradient descent)
      this.weights = this.trainLogisticRegression(examples);
    } catch {
      // Training failed, weights stay null
    }
  }

  private trainLogisticRegression(examples: TrainingExample[]): number[][] {
    const numFeatures = examples[0].features.length;
    const numClasses = 3;
    const learningRate = 0.01;
    const iterations = 100;

    // Initialize weights (bias + features) for each class
    const weights: number[][] = Array(numClasses)
      .fill(0)
      .map(() => Array(numFeatures + 1).fill(0));

    for (let iter = 0; iter < iterations; iter++) {
      for (const ex of examples) {
        const features = [1, ...ex.features]; // add bias term
        const scores = this.predict(ex.features);

        for (let c = 0; c < numClasses; c++) {
          const target = ex.label === c ? 1 : 0;
          const error = scores[c] - target;

          for (let f = 0; f < features.length; f++) {
            weights[c][f] -= learningRate * error * features[f];
          }
        }
      }
    }

    return weights;
  }
}
