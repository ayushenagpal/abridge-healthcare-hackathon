import type { AgentChoice, Candidate, LlmProvider } from "../types";

/**
 * Deterministic mock provider — the default for the demo. The candidate list
 * and its cost-ladder ordering are computed deterministically by policy.ts;
 * the "model" simply takes the highest-priority valid candidate. This makes the
 * demo fully reproducible and independent of any live model.
 */
export class MockLlmProvider implements LlmProvider {
  name = "mock" as const;

  async chooseAction(input: { candidates: Candidate[] }): Promise<AgentChoice> {
    const pick = input.candidates[0];
    if (!pick) {
      return {
        tool: null,
        reasoning: "No actionable operational work; waiting for the next event.",
        source: "mock",
      };
    }
    return {
      tool: pick.tool,
      reasoning: `${pick.rationale} (lowest-cost available action for the critical path).`,
      source: "mock",
    };
  }
}
