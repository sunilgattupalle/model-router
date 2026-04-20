#!/usr/bin/env node
import { writeFileSync } from "fs";
import { join } from "path";

interface SyntheticSample {
  prompt: string;
  model: "haiku" | "sonnet" | "opus";
  reasoning: string;
}

const syntheticSamples: SyntheticSample[] = [
  // Haiku: Questions and simple queries
  { prompt: "what is the difference between const and let", model: "haiku", reasoning: "simple question" },
  { prompt: "how do I check if a file exists", model: "haiku", reasoning: "simple question" },
  { prompt: "explain what this function does", model: "haiku", reasoning: "simple explanation" },
  { prompt: "why is this failing", model: "haiku", reasoning: "simple question" },
  { prompt: "can you show me the syntax", model: "haiku", reasoning: "simple question" },
  { prompt: "list all the files in src", model: "haiku", reasoning: "simple task" },
  { prompt: "describe the architecture", model: "haiku", reasoning: "simple explanation" },
  { prompt: "where is the config file", model: "haiku", reasoning: "simple question" },
  { prompt: "when should I use this pattern", model: "haiku", reasoning: "simple question" },
  { prompt: "which approach is better", model: "haiku", reasoning: "simple question" },
  { prompt: "hello", model: "haiku", reasoning: "greeting" },
  { prompt: "thanks", model: "haiku", reasoning: "acknowledgment" },
  { prompt: "is this correct", model: "haiku", reasoning: "simple question" },
  { prompt: "does this make sense", model: "haiku", reasoning: "simple question" },
  { prompt: "what does this error mean", model: "haiku", reasoning: "simple question" },

  // Sonnet: Standard coding tasks
  { prompt: "add a new endpoint for user authentication", model: "sonnet", reasoning: "standard feature" },
  { prompt: "fix the bug in the login flow", model: "sonnet", reasoning: "bug fix" },
  { prompt: "update the validation logic to handle edge cases", model: "sonnet", reasoning: "enhancement" },
  { prompt: "create a new component for the dashboard", model: "sonnet", reasoning: "new component" },
  { prompt: "implement pagination for the user list", model: "sonnet", reasoning: "feature implementation" },
  { prompt: "write tests for the authentication module", model: "sonnet", reasoning: "testing" },
  { prompt: "modify the database query to include filters", model: "sonnet", reasoning: "modification" },
  { prompt: "change the error handling to be more robust", model: "sonnet", reasoning: "improvement" },
  { prompt: "build a form validator", model: "sonnet", reasoning: "new utility" },
  { prompt: "remove the deprecated API calls", model: "sonnet", reasoning: "cleanup" },
  { prompt: "add logging to the payment processing", model: "sonnet", reasoning: "enhancement" },
  { prompt: "configure the CI pipeline for staging", model: "sonnet", reasoning: "configuration" },
  { prompt: "setup the development environment", model: "sonnet", reasoning: "setup" },
  { prompt: "install the required dependencies", model: "sonnet", reasoning: "setup" },
  { prompt: "move the utility functions to a shared module", model: "sonnet", reasoning: "refactor" },
  { prompt: "delete the unused code in the helpers file", model: "sonnet", reasoning: "cleanup" },
  { prompt: "write a script to migrate the data", model: "sonnet", reasoning: "scripting" },
  { prompt: "add error boundaries to the React components", model: "sonnet", reasoning: "enhancement" },
  { prompt: "implement caching for the API responses", model: "sonnet", reasoning: "optimization" },
  { prompt: "update the README with setup instructions", model: "sonnet", reasoning: "documentation" },

  // Opus: Complex, architectural, security tasks
  { prompt: "refactor the entire authentication system to use OAuth2", model: "opus", reasoning: "major refactor" },
  { prompt: "architect a microservices solution for the payment system", model: "opus", reasoning: "architecture" },
  { prompt: "design a scalable solution for real-time notifications", model: "opus", reasoning: "system design" },
  { prompt: "security review of the API authentication flow", model: "opus", reasoning: "security review" },
  { prompt: "analyze the performance bottlenecks across the codebase", model: "opus", reasoning: "performance analysis" },
  { prompt: "migrate the monolith to a distributed architecture", model: "opus", reasoning: "migration" },
  { prompt: "plan the implementation of multi-tenancy", model: "opus", reasoning: "planning" },
  { prompt: "implement a complex distributed transaction system", model: "opus", reasoning: "complex implementation" },
  { prompt: "build the entire backend from scratch", model: "opus", reasoning: "ground-up build" },
  { prompt: "refactor the data layer to support sharding", model: "opus", reasoning: "major refactor" },
  { prompt: "design the CI/CD pipeline for multi-region deployment", model: "opus", reasoning: "architecture" },
  { prompt: "code review the entire codebase for security issues", model: "opus", reasoning: "code review" },
  { prompt: "architect the event-driven system for order processing", model: "opus", reasoning: "architecture" },
  { prompt: "analyze the entire system for scaling bottlenecks", model: "opus", reasoning: "analysis" },
  { prompt: "refactor the authentication to support SSO and MFA", model: "opus", reasoning: "complex refactor" },
  { prompt: "design a fault-tolerant distributed cache", model: "opus", reasoning: "system design" },
  { prompt: "implement zero-downtime deployment strategy", model: "opus", reasoning: "complex implementation" },
  { prompt: "security audit of the entire application", model: "opus", reasoning: "security audit" },
  { prompt: "optimize the database schema for 10x traffic", model: "opus", reasoning: "performance" },
  { prompt: "architect the data pipeline for real-time analytics", model: "opus", reasoning: "architecture" },
];

interface TrainingFeatures {
  wordCount: number;
  hasQuestion: number;
  hasActionVerb: number;
  hasComplexSignal: number;
  estimatedTokens: number;
}

function extractTrainingFeatures(prompt: string): TrainingFeatures {
  const lower = prompt.toLowerCase();
  const wordCount = prompt.split(/\s+/).length;

  const questionWords = ["what", "how", "why", "where", "when", "which", "is", "are", "can", "does", "do"];
  const hasQuestion = questionWords.some((q) => new RegExp(`\\b${q}\\b`).test(lower)) ? 1 : 0;

  const actionVerbs = ["add", "update", "fix", "create", "implement", "build", "change", "modify", "write", "remove", "delete", "move", "configure", "setup", "install"];
  const hasActionVerb = actionVerbs.some((v) => lower.includes(v)) ? 1 : 0;

  const complexSignals = ["refactor", "architect", "design", "security", "performance", "migrate", "complex", "analyze", "review", "audit", "optimize", "distributed", "scalable"];
  const hasComplexSignal = complexSignals.some((s) => lower.includes(s)) ? 1 : 0;

  return {
    wordCount: wordCount / 100, // normalized
    hasQuestion,
    hasActionVerb,
    hasComplexSignal,
    estimatedTokens: Math.ceil(prompt.length / 4) / 1000, // normalized
  };
}

interface TrainingData {
  samples: Array<{
    prompt: string;
    features: TrainingFeatures;
    label: 0 | 1 | 2; // 0=haiku, 1=sonnet, 2=opus
    reasoning: string;
  }>;
  metadata: {
    totalSamples: number;
    distribution: { haiku: number; sonnet: number; opus: number };
    generatedAt: string;
  };
}

function generateTrainingData(): TrainingData {
  const modelToLabel = { haiku: 0, sonnet: 1, opus: 2 } as const;
  const distribution = { haiku: 0, sonnet: 0, opus: 0 };

  const samples = syntheticSamples.map((sample) => {
    distribution[sample.model]++;
    return {
      prompt: sample.prompt,
      features: extractTrainingFeatures(sample.prompt),
      label: modelToLabel[sample.model],
      reasoning: sample.reasoning,
    };
  });

  return {
    samples,
    metadata: {
      totalSamples: samples.length,
      distribution,
      generatedAt: new Date().toISOString(),
    },
  };
}

function trainLogisticRegression(data: TrainingData): number[][] {
  const numFeatures = 5;
  const numClasses = 3;
  const learningRate = 0.01;
  const iterations = 200;

  // Initialize weights (bias + features) for each class
  const weights: number[][] = Array(numClasses)
    .fill(0)
    .map(() => Array(numFeatures + 1).fill(0));

  for (let iter = 0; iter < iterations; iter++) {
    for (const sample of data.samples) {
      const features = [
        1, // bias
        sample.features.wordCount,
        sample.features.hasQuestion,
        sample.features.hasActionVerb,
        sample.features.hasComplexSignal,
        sample.features.estimatedTokens,
      ];

      // Compute scores for all classes
      const scores = weights.map((w) => {
        let score = 0;
        for (let i = 0; i < features.length; i++) {
          score += w[i] * features[i];
        }
        return 1 / (1 + Math.exp(-score)); // sigmoid
      });

      // Softmax
      const expScores = scores.map(Math.exp);
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      const probs = expScores.map((s) => s / sumExp);

      // Gradient descent
      for (let c = 0; c < numClasses; c++) {
        const target = sample.label === c ? 1 : 0;
        const error = probs[c] - target;

        for (let f = 0; f < features.length; f++) {
          weights[c][f] -= learningRate * error * features[f];
        }
      }
    }
  }

  return weights;
}

function main() {
  console.log("🔨 Generating baseline training data...");
  const trainingData = generateTrainingData();

  console.log(`   Total samples: ${trainingData.metadata.totalSamples}`);
  console.log(`   Distribution: haiku=${trainingData.metadata.distribution.haiku}, sonnet=${trainingData.metadata.distribution.sonnet}, opus=${trainingData.metadata.distribution.opus}`);

  console.log("\n🎓 Training baseline model...");
  const weights = trainLogisticRegression(trainingData);

  console.log("   Training complete!\n");

  // Test on training data (sanity check)
  let correct = 0;
  for (const sample of trainingData.samples) {
    const features = [
      sample.features.wordCount,
      sample.features.hasQuestion,
      sample.features.hasActionVerb,
      sample.features.hasComplexSignal,
      sample.features.estimatedTokens,
    ];

    const scores = weights.map((w) => {
      let score = w[0]; // bias
      for (let i = 0; i < features.length; i++) {
        score += w[i + 1] * features[i];
      }
      return 1 / (1 + Math.exp(-score));
    });

    const expScores = scores.map(Math.exp);
    const sumExp = expScores.reduce((a, b) => a + b, 0);
    const probs = expScores.map((s) => s / sumExp);

    const predicted = probs.indexOf(Math.max(...probs));
    if (predicted === sample.label) correct++;
  }

  const accuracy = correct / trainingData.samples.length;
  console.log(`📊 Training accuracy: ${(accuracy * 100).toFixed(1)}% (${correct}/${trainingData.samples.length})`);

  // Save baseline model
  const baseline = {
    weights,
    metadata: {
      ...trainingData.metadata,
      trainingAccuracy: accuracy,
      features: ["wordCount", "hasQuestion", "hasActionVerb", "hasComplexSignal", "estimatedTokens"],
      version: "1.0.0",
    },
  };

  const outputPath = join(import.meta.dirname, "..", "models", "baseline.json");
  writeFileSync(outputPath, JSON.stringify(baseline, null, 2));

  console.log(`\n✅ Baseline model saved to: models/baseline.json`);
  console.log(`   Use this as fallback when user has <10 training samples\n`);
}

main();
