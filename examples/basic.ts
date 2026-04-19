import { route, executeWithEscalation, getStats, formatStats, type RequestFeatures } from "../src/index.js";

// Example 1: Simple routing decision
console.log("=== Example 1: Routing Decision ===\n");

const simpleTask: RequestFeatures = {
  promptTokens: 200,
  toolCount: 0,
  fileCount: 0,
  hasToolUse: false,
};

const decision1 = route(simpleTask);
console.log(`Task: "${simpleTask.promptTokens} tokens, no tools"`);
console.log(`→ Routed to: ${decision1.model}`);
console.log(`→ Rule: ${decision1.rule}`);
console.log(`→ Confidence: ${decision1.confidence}\n`);

// Example 2: Complex task routing
const complexTask: RequestFeatures = {
  promptTokens: 2500,
  toolCount: 5,
  fileCount: 4,
  hasToolUse: true,
};

const decision2 = route(complexTask);
console.log(`Task: "${complexTask.promptTokens} tokens, ${complexTask.toolCount} tools, ${complexTask.fileCount} files"`);
console.log(`→ Routed to: ${decision2.model}`);
console.log(`→ Rule: ${decision2.rule}\n`);

// Example 3: Execution with auto-escalation
console.log("=== Example 2: Execution with Auto-Escalation ===\n");

const mockExecute = async (modelId: string) => {
  console.log(`Attempting execution with ${modelId}...`);

  // Simulate haiku failing, sonnet succeeding
  if (modelId.includes("haiku")) {
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log("  ✗ Failed");
    return { success: false, tokensUsed: 50, latencyMs: 100 };
  }

  await new Promise(resolve => setTimeout(resolve, 200));
  console.log("  ✓ Success");
  return { success: true, tokensUsed: 800, latencyMs: 800 };
};

const result = await executeWithEscalation(
  "Fix this complex bug across multiple files",
  "haiku",
  mockExecute
);

console.log(`\nFinal model: ${result.finalModel}`);
if (result.escalations.length > 0) {
  console.log(`Escalation path: ${result.escalations.join(" → ")} → ${result.finalModel}`);
}

// Example 4: View stats
console.log("\n=== Example 3: Stats ===");
const stats = getStats();
console.log(formatStats(stats));
