import { describe, it, expect } from "vitest";
import { route, loadConfig } from "./router.js";
import { executeWithEscalation } from "./escalator.js";
import { getStats } from "./stats.js";

describe("integration", () => {
  loadConfig();

  it("routes and logs a simple successful request", async () => {
    const prompt = "write a hello world function";
    const features = { promptTokens: 50, toolCount: 0, fileCount: 0, hasToolUse: false };

    const decision = route(features);
    expect(decision.model).toBe("haiku");

    // Simulate execution
    const mockExecute = async (modelId: string) => {
      return { success: true, tokensUsed: 100, latencyMs: 250 };
    };

    const result = await executeWithEscalation(prompt, decision.model, mockExecute);

    expect(result.finalModel).toBe("haiku");
    expect(result.escalations).toHaveLength(0);
    expect(result.decision.modelSelected).toBe("haiku");
  });

  it("escalates on failure", async () => {
    const prompt = "complex refactoring task";
    const features = { promptTokens: 400, toolCount: 0, fileCount: 0, hasToolUse: false };

    const decision = route(features);
    expect(decision.model).toBe("haiku");

    let attempts = 0;
    const mockExecute = async (modelId: string) => {
      attempts++;
      // Fail on haiku, succeed on sonnet
      if (modelId.includes("haiku")) {
        return { success: false, tokensUsed: 50, latencyMs: 100 };
      }
      return { success: true, tokensUsed: 500, latencyMs: 800 };
    };

    const result = await executeWithEscalation(prompt, decision.model, mockExecute);

    expect(result.finalModel).toBe("sonnet");
    expect(result.escalations).toEqual(["haiku"]);
    expect(attempts).toBe(2);
  });

  it("tracks stats across requests", async () => {
    const stats = getStats();

    expect(stats.totalRequests).toBeGreaterThan(0);
    expect(stats.byModel).toBeDefined();
    expect(stats.escalationRate).toBeGreaterThanOrEqual(0);
    expect(stats.totalCost).toBeGreaterThanOrEqual(0);
  });
});
