import { describe, it, expect } from "vitest";
import { route, loadConfig, escalate, type RequestFeatures } from "./router.js";

describe("router", () => {
  loadConfig();

  it("routes simple queries to haiku", () => {
    const features: RequestFeatures = { promptTokens: 200, toolCount: 0, fileCount: 0, hasToolUse: false };
    const result = route(features);
    expect(result.model).toBe("haiku");
    expect(result.rule).toBe("simple-queries");
  });

  it("routes multi-file edits to opus", () => {
    const features: RequestFeatures = { promptTokens: 2000, toolCount: 5, fileCount: 4, hasToolUse: true };
    const result = route(features);
    expect(result.model).toBe("opus");
    expect(result.rule).toBe("multi-file-edits");
  });

  it("defaults to sonnet", () => {
    const features: RequestFeatures = { promptTokens: 1000, toolCount: 1, fileCount: 1, hasToolUse: true };
    const result = route(features);
    expect(result.model).toBe("sonnet");
    expect(result.rule).toBe("default");
  });

  it("escalates haiku to sonnet", () => {
    expect(escalate("haiku")).toBe("sonnet");
  });

  it("escalates sonnet to opus", () => {
    expect(escalate("sonnet")).toBe("opus");
  });

  it("cannot escalate beyond opus", () => {
    expect(escalate("opus")).toBeNull();
  });
});
