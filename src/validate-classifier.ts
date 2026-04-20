#!/usr/bin/env node
import { getDb } from "./db.js";
import { MLClassifierStrategy } from "./strategies/ml-classifier.js";
import { extractFeatures } from "./strategies/base.js";

interface ValidationResult {
  accuracy: number;
  totalSamples: number;
  perModelAccuracy: Record<string, { correct: number; total: number; accuracy: number }>;
  confusionMatrix: number[][];
}

async function validateClassifier(): Promise<ValidationResult> {
  const db = getDb();

  // Fetch all successful decisions with outcomes
  const rows = db.prepare(`
    SELECT d.id, d.prompt_tokens, d.rule_matched, d.model_selected, o.status
    FROM decisions d
    JOIN outcomes o ON d.id = o.decision_id
    WHERE o.status = 'success'
    ORDER BY d.timestamp DESC
    LIMIT 200
  `).all() as Array<{
    id: string;
    prompt_tokens: number;
    rule_matched: string;
    model_selected: string;
    status: string;
  }>;

  if (rows.length < 20) {
    console.log("❌ Not enough data for validation (need at least 20 successful decisions)");
    console.log(`   Found: ${rows.length}`);
    return {
      accuracy: 0,
      totalSamples: rows.length,
      perModelAccuracy: {},
      confusionMatrix: [],
    };
  }

  // Split: 80% train, 20% test
  const splitIdx = Math.floor(rows.length * 0.8);
  const trainSet = rows.slice(0, splitIdx);
  const testSet = rows.slice(splitIdx);

  console.log(`\n📊 ML Classifier Validation`);
  console.log(`   Training set: ${trainSet.length} samples`);
  console.log(`   Test set: ${testSet.length} samples\n`);

  // Train classifier (it trains internally on first call)
  const classifier = new MLClassifierStrategy();

  // Make predictions on test set
  const modelMap = { haiku: 0, sonnet: 1, opus: 2 };
  const modelNames = ["haiku", "sonnet", "opus"];
  let correct = 0;
  const perModel: Record<string, { correct: number; total: number }> = {
    haiku: { correct: 0, total: 0 },
    sonnet: { correct: 0, total: 0 },
    opus: { correct: 0, total: 0 },
  };
  const confusionMatrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  for (const row of testSet) {
    // Reconstruct features
    const hasQuestion = row.rule_matched.includes("question");
    const hasAction = row.rule_matched.includes("action");
    const hasComplex = row.rule_matched.includes("complex");

    const features = {
      prompt: "",
      wordCount: Math.ceil(row.prompt_tokens / 0.75),
      hasQuestion,
      hasActionVerb: hasAction,
      hasComplexSignal: hasComplex,
      estimatedTokens: row.prompt_tokens,
    };

    const prediction = await classifier.route(features);
    const actual = row.model_selected;

    perModel[actual].total++;
    if (prediction.model === actual) {
      correct++;
      perModel[actual].correct++;
    }

    // Update confusion matrix
    const actualIdx = modelMap[actual as keyof typeof modelMap];
    const predIdx = modelMap[prediction.model as keyof typeof modelMap];
    confusionMatrix[actualIdx][predIdx]++;
  }

  const accuracy = correct / testSet.length;
  const perModelAccuracy: Record<string, { correct: number; total: number; accuracy: number }> = {};
  for (const [model, stats] of Object.entries(perModel)) {
    perModelAccuracy[model] = {
      ...stats,
      accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
    };
  }

  return {
    accuracy,
    totalSamples: testSet.length,
    perModelAccuracy,
    confusionMatrix,
  };
}

function printResults(result: ValidationResult) {
  console.log(`Overall Accuracy: ${(result.accuracy * 100).toFixed(1)}%`);
  console.log(`   (${Math.round(result.accuracy * result.totalSamples)}/${result.totalSamples} correct)\n`);

  console.log(`Per-Model Accuracy:`);
  for (const [model, stats] of Object.entries(result.perModelAccuracy)) {
    const acc = stats.accuracy * 100;
    const bar = "█".repeat(Math.round(acc / 5));
    console.log(`   ${model.padEnd(7)} ${acc.toFixed(1).padStart(5)}%  ${bar}  (${stats.correct}/${stats.total})`);
  }

  console.log(`\nConfusion Matrix:`);
  console.log(`              Predicted`);
  console.log(`        haiku  sonnet  opus`);
  const modelNames = ["haiku", "sonnet", "opus"];
  result.confusionMatrix.forEach((row, i) => {
    const label = modelNames[i].padEnd(6);
    const cells = row.map((val) => String(val).padStart(6)).join("");
    console.log(`${label}${cells}`);
  });

  console.log(`\nInterpretation:`);
  if (result.accuracy > 0.8) {
    console.log(`✅ Excellent - ML classifier is performing very well`);
  } else if (result.accuracy > 0.6) {
    console.log(`⚠️  Good - ML classifier is useful but has room for improvement`);
  } else if (result.accuracy > 0.4) {
    console.log(`⚠️  Fair - ML classifier is learning but may not beat rule-based yet`);
  } else {
    console.log(`❌ Poor - Not enough training data or features need refinement`);
  }

  if (result.totalSamples < 50) {
    console.log(`💡 Tip: Collect more data (currently ${result.totalSamples} test samples)`);
  }
}

async function main() {
  try {
    const result = await validateClassifier();
    if (result.totalSamples > 0) {
      printResults(result);
    }
  } catch (error) {
    console.error("Validation failed:", error);
    process.exit(1);
  }
}

main();
