import { RoutingStrategy, type RoutingDecision, type PromptFeatures } from "./base.js";

export class LLMRoutingStrategy extends RoutingStrategy {
  name = "llm-routing";
  private apiKey: string;
  private endpoint: string;

  constructor(apiKey?: string, endpoint?: string) {
    super();
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.endpoint = endpoint || "https://api.anthropic.com/v1/messages";
  }

  async route(features: PromptFeatures): Promise<RoutingDecision> {
    try {
      const response = await this.callLLM(features.prompt);
      return this.parseResponse(response);
    } catch (error) {
      // Fallback to simple heuristic
      const model = features.hasComplexSignal ? "opus" : features.hasActionVerb ? "sonnet" : "haiku";
      return {
        model,
        reasoning: `llm routing failed (${error}), using fallback`,
        confidence: 0.3,
      };
    }
  }

  private async callLLM(prompt: string): Promise<string> {
    const systemPrompt = `You are a model router. Given a user prompt, determine which Claude model is most appropriate:
- haiku: Simple questions, quick tasks, <500 tokens
- sonnet: Standard tasks, code changes, moderate complexity
- opus: Complex refactors, architecture design, security reviews

Respond with JSON: {"model": "haiku|sonnet|opus", "reasoning": "brief explanation", "confidence": 0.0-1.0}`;

    const requestBody = {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Analyze this prompt and recommend a model:\n\n${prompt.slice(0, 1000)}`,
        },
      ],
      system: systemPrompt,
    };

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || "";
  }

  private parseResponse(text: string): RoutingDecision {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        model: parsed.model,
        reasoning: `llm routing: ${parsed.reasoning}`,
        confidence: parsed.confidence || 0.7,
      };
    } catch {
      return { model: "sonnet", reasoning: "llm response parse failed", confidence: 0.3 };
    }
  }
}
