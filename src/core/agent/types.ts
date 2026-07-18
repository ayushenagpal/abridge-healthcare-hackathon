import type { PatientState, ProtocolResult } from "../models";

/** A concrete operational action the agent may take. */
export interface Candidate {
  tool: string;
  args: Record<string, unknown>;
  requirementId: string;
  label: string;
  rationale: string;
  /** Cost-ladder rank (lower = cheaper/preferred). */
  cost: number;
  tier: 1 | 2 | 3;
}

export interface AgentChoice {
  tool: string | null;
  reasoning: string;
  source: "policy" | "llm" | "mock";
}

/** The Navigator's LLM boundary. It may ONLY choose among valid candidates and
 * draft human-facing text. It never determines clinical logic. */
export interface LlmProvider {
  name: "mock" | "anthropic";
  /** Choose among already-valid candidates, or return null to wait. */
  chooseAction(input: {
    candidates: Candidate[];
    state: PatientState;
    protocol: ProtocolResult;
  }): Promise<AgentChoice>;
}
