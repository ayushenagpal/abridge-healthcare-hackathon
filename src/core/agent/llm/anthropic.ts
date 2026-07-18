import Anthropic from "@anthropic-ai/sdk";
import type { AgentChoice, Candidate, LlmProvider } from "../types";

/**
 * Optional live provider. The LLM ONLY orchestrates: it selects among
 * already-valid operational candidates that the deterministic policy produced.
 * It never determines clinical logic, risk, thresholds, or readiness.
 *
 * Not used in the default demo (which runs the deterministic mock). Enabling it
 * requires an API key and, in a browser, a proxy — calling Anthropic directly
 * from the browser exposes the key. Provided for authenticity/completeness.
 */
export class AnthropicLlmProvider implements LlmProvider {
  name = "anthropic" as const;
  private client: Anthropic;
  private model: string;

  constructor(opts: { apiKey: string; model?: string; baseURL?: string }) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      dangerouslyAllowBrowser: true,
    });
    this.model = opts.model ?? "claude-opus-4-8";
  }

  async chooseAction(input: { candidates: Candidate[] }): Promise<AgentChoice> {
    if (input.candidates.length === 0)
      return { tool: null, reasoning: "No actionable work.", source: "llm" };

    const options = input.candidates
      .map((c, i) => `${i}: ${c.label} — ${c.rationale} (tier ${c.tier})`)
      .join("\n");

    // output_config (structured outputs) is cast through `any` for
    // forward-compatibility with SDK versions that predate the typed field.
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system:
        "You are the operations orchestrator for a pre-operative navigator. " +
        "You may ONLY pick the single highest-value operational action from the numbered list. " +
        "Prefer lower-cost actions. You never make clinical decisions — the deterministic protocol engine already did that.",
      messages: [
        {
          role: "user",
          content: `Open operational actions:\n${options}\n\nPick the best index to work now. Reply as JSON: {"index": <n>, "reasoning": "<why>"}.`,
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              index: { type: "integer" },
              reasoning: { type: "string" },
            },
            required: ["index", "reasoning"],
            additionalProperties: false,
          },
        },
      },
    } as unknown as Parameters<typeof this.client.messages.create>[0]);

    const msg = response as unknown as {
      content: { type: string; text?: string }[];
    };
    const text = msg.content.find((b) => b.type === "text");
    const parsed = JSON.parse(text?.text ?? "{}") as {
      index: number;
      reasoning: string;
    };
    const chosen = input.candidates[parsed.index] ?? input.candidates[0];
    return { tool: chosen.tool, reasoning: parsed.reasoning, source: "llm" };
  }
}
